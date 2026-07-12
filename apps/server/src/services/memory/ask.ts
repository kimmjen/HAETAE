import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { sessionMessages, projectWiki } from "../../db/schema";
import { callClaude, type ClaudeModel } from "./claude-cli";
import { getNotes } from "./notes";
import {
  selectRelevantNotes,
  selectRelevantNotesSemantic,
  buildNotesBlock,
  type ScoredNote,
} from "./recall";

const SOURCE_BUDGET = 40_000; // chars of conversation excerpts fed to the agent
const MAX_KEYWORDS = 8;
const MAX_SOURCES = 12;

// Short, low-signal tokens to drop from a question before keyword matching.
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "of", "to", "in", "on", "and", "or", "what",
  "how", "why", "when", "where", "which", "그", "이", "저", "은", "는", "이게",
  "뭐", "뭔", "어떻게", "왜", "무엇", "어디", "해줘", "알려줘",
]);

/** Pure: extract up to MAX_KEYWORDS meaningful keywords from a question. */
export function questionKeywords(question: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of question.toLowerCase().split(/[\s,.?!()[\]{}"'`/\\]+/)) {
    const w = raw.replace(/[^a-z0-9가-힣]/g, "");
    if (w.length < 2 || STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

export interface BrainSource {
  tag: string; // "S1", "S2", ...
  sessionId: string;
  ts: number;
  snippet: string;
}

/**
 * Lightweight retrieval (no embeddings): pull conversation messages that match
 * the question's keywords, score by keyword-hit count, and keep the top ones
 * within a char budget. This feeds the agent identifiable, citable sources.
 */
export function selectSources(
  db: Db,
  projectPath: string,
  question: string,
): BrainSource[] {
  const keywords = questionKeywords(question);
  if (keywords.length === 0) return [];

  const likeClause = sql.join(
    keywords.map((k) => sql`lower(${sessionMessages.content}) LIKE ${"%" + k + "%"}`),
    sql` OR `,
  );
  const rows = db
    .select({ sessionId: sessionMessages.sessionId, ts: sessionMessages.ts, content: sessionMessages.content })
    .from(sessionMessages)
    .where(
      sql`${sessionMessages.projectPath} = ${projectPath}
        AND ${sessionMessages.content} IS NOT NULL
        AND ${sessionMessages.type} IN ('user', 'assistant')
        AND ${sessionMessages.isCompactSummary} = 0
        AND (${likeClause})`,
    )
    .all() as Array<{ sessionId: string; ts: number; content: string }>;

  const scored = rows
    .map((r) => {
      const lc = r.content.toLowerCase();
      const score = keywords.reduce((s, k) => s + (lc.split(k).length - 1), 0);
      return { ...r, score };
    })
    .sort((a, b) => b.score - a.score || b.ts - a.ts);

  const sources: BrainSource[] = [];
  let used = 0;
  for (const r of scored) {
    if (sources.length >= MAX_SOURCES) break;
    const snippet = r.content.length > 2000 ? r.content.slice(0, 2000) + "…" : r.content;
    if (sources.length > 0 && used + snippet.length > SOURCE_BUDGET) break;
    sources.push({ tag: `S${sources.length + 1}`, sessionId: r.sessionId, ts: r.ts, snippet });
    used += snippet.length;
  }
  return sources;
}

/**
 * Build the prompt. The knowledge block is EITHER bounded notes ([N1]/[N2]…,
 * the default once notes exist) OR the full wiki ([W], fallback when notes
 * aren't generated). Conversation excerpts ([S1]…) are always appended.
 */
export function buildPrompt(
  knowledge: { kind: "notes"; block: string } | { kind: "wiki"; content: string | null },
  sources: BrainSource[],
  question: string,
): string {
  const knowledgeBlock =
    knowledge.kind === "notes"
      ? `=== NOTES ([N…] = 원자 노트) ===\n${knowledge.block || "(노트 없음)"}\n`
      : `=== WIKI [W] ===\n${knowledge.content ?? "(위키 없음)"}\n`;
  const noteTag = knowledge.kind === "notes" ? "[N1]/[N2]/…" : "[W]";

  const excerpts = sources.length
    ? sources
        .map((s) => {
          const date = new Date(s.ts).toISOString().slice(0, 10);
          return `[${s.tag}] (${date}, session ${s.sessionId})\n${s.snippet}`;
        })
        .join("\n\n---\n\n")
    : "(관련 대화 발췌 없음)";

  return `You answer a question using ONLY the project's knowledge base below. Cite every claim inline with its source tag: ${noteTag} for the knowledge notes, [S1]/[S2]/… for conversation excerpts. If the answer is not supported by the sources, say so plainly — do NOT invent.

${knowledgeBlock}
=== CONVERSATION EXCERPTS ===
${excerpts}

=== QUESTION ===
${question}

Answer concisely in Korean (mixed Korean/English ok). Put the source tag right after each claim, e.g. "워터마크로 증분 흡수한다 ${knowledge.kind === "notes" ? "[N1][S2]" : "[W][S2]"}". If unsure, say 출처에서 확인 불가.`;
}

export interface AskResult {
  question: string;
  answer: string;
  sources: BrainSource[];
  model: ClaudeModel;
}

/**
 * Answer a question against a project's second brain (wiki + relevant
 * conversation excerpts), with source attribution. Stateless — each call is a
 * fresh agent run. No file writes; reads DB only.
 */
export async function askProjectBrain(
  projectPath: string,
  question: string,
  model: ClaudeModel = "claude-opus-4-8",
  db: Db = getDb(),
): Promise<AskResult> {
  const sources = selectSources(db, projectPath, question);

  // Bounded recall: if atomic notes exist, retrieve only the relevant
  // subgraph instead of the whole wiki (prompt size stays bounded as the
  // corpus grows). Meaning-based selection first (the agent reads the note
  // index and picks by meaning); fall back to literal keyword seeding if it
  // selects nothing or fails, then to the full wiki when notes don't exist.
  const notesResult = getNotes(projectPath, db);
  let selected: ScoredNote[] = [];
  if (notesResult) {
    selected = await selectRelevantNotesSemantic(notesResult.notes, question, model).catch(() => []);
    if (selected.length === 0) selected = selectRelevantNotes(notesResult.notes, question);
  }

  let prompt: string;
  if (selected.length > 0) {
    const { block } = buildNotesBlock(selected);
    prompt = buildPrompt({ kind: "notes", block }, sources, question);
  } else {
    const wiki = db
      .select({ content: projectWiki.content })
      .from(projectWiki)
      .where(sql`${projectWiki.projectPath} = ${projectPath}`)
      .get();
    prompt = buildPrompt({ kind: "wiki", content: wiki?.content ?? null }, sources, question);
  }

  const answer = await callClaude(prompt, model);
  return { question, answer, sources, model };
}
