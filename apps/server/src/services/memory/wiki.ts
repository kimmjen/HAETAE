import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { sessionMessages, projectWiki, memories } from "../../db/schema";
import { injectWikiIntoCLAUDEMd } from "./inject-wiki";
import { archiveWikiVersion, getWikiHistoryEntry } from "./wiki-history";
import { callClaude, type ClaudeModel } from "./claude-cli";
import { getEval, evalCorrectionHints } from "./eval";
import { getNotes } from "./notes";

/**
 * Char budget for the NEW (delta) messages folded into the wiki in a single
 * generation. The existing wiki is added on top of this — wiki size itself is
 * unbounded for now (size-cap is a separate follow-up). If a project has more
 * unfolded messages than fit this budget, the oldest chunk is folded and the
 * rest is left pending for the next generation (the wiki reports isStale).
 */
const DELTA_BUDGET = 80_000;

/**
 * Char budget for the compact-summary prelude used only when bootstrapping a
 * wiki from scratch (first generation / reset). It gives the synthesizer the
 * project's long-range history breadth that the oldest raw chunk alone lacks.
 */
const MEMORIES_BUDGET = 20_000;

/** Wiki synthesis rewrites the whole wiki — needs far more than the 3m default. */
const WIKI_TIMEOUT_MS = 600_000;

/** Re-export under the wiki-facing name; single underlying type in claude-cli. */
export type WikiModel = ClaudeModel;

export interface DeltaMessage {
  ts: number;
  uuid: string;
  type: string;
  content: string;
}

/**
 * Load messages strictly AFTER the keyset watermark (afterTs, afterUuid),
 * oldest-first. Keyset pagination over the total order (ts ASC, uuid ASC) so
 * messages sharing a ts are neither skipped nor double-folded. uuid is UNIQUE
 * so (ts, uuid) is a total order.
 */
export function loadDeltaMessages(
  db: Db,
  projectPath: string,
  afterTs: number,
  afterUuid: string,
): DeltaMessage[] {
  return db
    .select({
      ts: sessionMessages.ts,
      uuid: sessionMessages.uuid,
      type: sessionMessages.type,
      content: sessionMessages.content,
    })
    .from(sessionMessages)
    .where(
      sql`${sessionMessages.projectPath} = ${projectPath}
        AND ${sessionMessages.content} IS NOT NULL
        AND ${sessionMessages.content} != ''
        AND ${sessionMessages.type} IN ('user', 'assistant')
        AND ${sessionMessages.isCompactSummary} = 0
        AND (
          ${sessionMessages.ts} > ${afterTs}
          OR (${sessionMessages.ts} = ${afterTs} AND ${sessionMessages.uuid} > ${afterUuid})
        )`,
    )
    .orderBy(sessionMessages.ts, sessionMessages.uuid)
    .all() as DeltaMessage[];
}

/** Count messages still pending after the watermark — drives isStale. */
export function countPending(
  db: Db,
  projectPath: string,
  afterTs: number,
  afterUuid: string,
): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(sessionMessages)
    .where(
      sql`${sessionMessages.projectPath} = ${projectPath}
        AND ${sessionMessages.content} IS NOT NULL
        AND ${sessionMessages.content} != ''
        AND ${sessionMessages.type} IN ('user', 'assistant')
        AND ${sessionMessages.isCompactSummary} = 0
        AND (
          ${sessionMessages.ts} > ${afterTs}
          OR (${sessionMessages.ts} = ${afterTs} AND ${sessionMessages.uuid} > ${afterUuid})
        )`,
    )
    .get();
  return row?.n ?? 0;
}

export interface MemoryRow {
  ts: number;
  content: string;
}

/**
 * Load the project's compact summaries (Claude Code's own per-compaction
 * compression), oldest-first. Used only to bootstrap a fresh wiki.
 */
export function loadMemories(db: Db, projectPath: string): MemoryRow[] {
  return db
    .select({ ts: memories.ts, content: memories.content })
    .from(memories)
    .where(sql`${memories.projectPath} = ${projectPath}`)
    .orderBy(memories.ts)
    .all() as MemoryRow[];
}

/**
 * Pure: join compact summaries oldest-first up to `budget` chars into a single
 * prelude string. Oldest-first because the foundational history is what the
 * recent raw window most lacks. Returns "" when there are no summaries.
 */
export function selectMemoriesPrelude(rows: MemoryRow[], budget = MEMORIES_BUDGET): string {
  const parts: string[] = [];
  let used = 0;
  for (const r of rows) {
    const text = (r.content ?? "").trim();
    if (!text) continue;
    const date = new Date(r.ts).toISOString().slice(0, 10);
    const block = `[${date}]\n${text}`;
    if (parts.length > 0 && used + block.length > budget) break;
    parts.push(block);
    used += block.length;
    if (used >= budget) break;
  }
  return parts.join("\n\n---\n\n");
}

export interface DeltaSelection {
  selected: DeltaMessage[];
  /** Watermark to persist after folding `selected`. */
  lastTs: number;
  lastUuid: string;
}

/**
 * Pure: from oldest-first delta messages, take a prefix that fits `budget`
 * chars, advancing the watermark to the last included message.
 *
 * Always includes at least one message — even if that single message alone
 * exceeds the budget — so the watermark can never get permanently stuck behind
 * an oversized message (e.g. a huge pasted log). Truncation of that message's
 * content for the prompt happens in buildPrompt.
 *
 * Caller must pass a non-empty array.
 */
export function selectDelta(messages: DeltaMessage[], budget = DELTA_BUDGET): DeltaSelection {
  const selected: DeltaMessage[] = [];
  let used = 0;
  for (const m of messages) {
    const len = (m.content ?? "").length;
    if (selected.length > 0 && used + len > budget) break;
    selected.push(m);
    used += len;
    if (used >= budget) break;
  }
  const last = selected[selected.length - 1];
  return { selected, lastTs: last.ts, lastUuid: last.uuid };
}

/** Absolute floor for any synthesized wiki — even a tiny project's wiki with
 *  the section skeleton alone comfortably exceeds this. */
const WIKI_MIN_CHARS = 100;
/** Incremental folding merges content — it never legitimately collapses to a
 *  fraction of the existing wiki. Below this ratio = failed synthesis. */
const WIKI_MIN_SHRINK_RATIO = 0.2;

/**
 * Reject degenerate synthesis output BEFORE it overwrites a living wiki. An
 * LLM hiccup (truncation, refusal, empty answer) must not destroy accumulated
 * memory — 2026-07-12 the HAETAE wiki (23k chars) was overwritten by a literal
 * "# HAETAE" and had to be rolled back from history.
 */
export function isDegenerateWikiOutput(content: string, previous: string | null): boolean {
  const len = content.trim().length;
  if (len < WIKI_MIN_CHARS) return true;
  if (previous && len < previous.length * WIKI_MIN_SHRINK_RATIO) return true;
  return false;
}

const STRUCTURE = `# {PROJECT}

## 개요 / Overview
## 주요 기능 / Key Features
## 기술 스택 / Tech Stack
## 최근 작업 / Recent Work
## 결정 사항 / Decisions Made
## 다음 단계 / Next Steps`;

/**
 * Build the synthesis prompt. When `existingWiki` is empty this is a from-
 * scratch creation; otherwise it is a RECONCILING merge — the existing wiki is
 * the source of truth and the delta updates/supersedes it. The merge framing
 * is what makes this a living knowledge base rather than a rolling summary.
 *
 * Each message's content is truncated to `budget` defensively so a single
 * oversized message can't blow the context window.
 */
export function buildPrompt(
  projectName: string,
  existingWiki: string,
  selected: DeltaMessage[],
  totalPending: number,
  memoriesPrelude = "",
  auditFindings = "",
  budget = DELTA_BUDGET,
): string {
  const transcript = selected
    .map((m) => {
      const role = m.type === "user" ? "User" : "Assistant";
      const date = new Date(m.ts).toISOString().slice(0, 16).replace("T", " ");
      const body = m.content.length > budget ? m.content.slice(0, budget) + "\n…(truncated)" : m.content;
      return `[${date}] ${role}: ${body.trim()}`;
    })
    .join("\n\n---\n\n");

  const structure = STRUCTURE.replace("{PROJECT}", projectName);

  if (!existingWiki.trim()) {
    // Bootstrap: optional compact-summary prelude gives full-history breadth
    // that the oldest raw chunk alone lacks. Framed as reference so the model
    // doesn't duplicate it against the detailed raw below.
    const preludeBlock = memoriesPrelude.trim()
      ? `=== COMPRESSED LONG-TERM MEMORY (Claude Code compact summaries of earlier sessions — reference for breadth) ===
${memoriesPrelude.trim()}

`
      : "";

    return `You are a technical knowledge manager creating a project wiki for "${projectName}" from its Claude Code conversation history.

${preludeBlock}=== DETAILED conversation messages (oldest→newest, ${selected.length} of ${totalPending} pending) ===
${transcript}

---

Write a wiki page in Markdown with this exact section structure:

${structure}

${preludeBlock ? "Use the compressed long-term memory for project-wide breadth and the detailed messages for specifics. Do NOT duplicate the same fact from both — reconcile into one statement.\n" : ""}Only include information derived from the conversation. Use bullet points. Write in mixed Korean/English for a bilingual developer audience. Output ONLY the markdown — no preamble.`;
  }

  // The wiki's own auditor (eval) flagged these against the CURRENT wiki; feed
  // them back so each regeneration self-corrects instead of only folding deltas.
  const auditBlock = auditFindings.trim()
    ? `\n=== AUDIT FINDINGS (a skeptical auditor flagged these in the CURRENT WIKI — fix each ONLY where the wiki or conversation supports it; ignore any not substantiated) ===
${auditFindings.trim()}
`
    : "";
  const auditRule = auditFindings.trim()
    ? "\n- ADDRESS the audit findings above where evidence supports them — fix inaccurate claims, fill flagged gaps, refresh stale statements. Never invent content just to satisfy a finding."
    : "";

  return `You are maintaining a LIVING project wiki for "${projectName}" — a single reconciled source of truth, NOT an append-only log and NOT a summary of recent chat.

=== CURRENT WIKI (source of truth) ===
${existingWiki.trim()}

=== NEW conversation messages since the last update (oldest→newest, ${selected.length} of ${totalPending} pending) ===
${transcript}
${auditBlock}
---

Produce the UPDATED full wiki in Markdown, keeping the section structure:

${structure}

Reconciliation rules — this is the whole point:${auditRule}
- If a new message changes or supersedes something in the current wiki (a decision reversed, a tool swapped, an approach abandoned), UPDATE that content. Do not keep both the old and new — state the current truth, and you may briefly note what it superseded.
- PRESERVE older decisions, architecture, and history that the new messages do not touch. Do NOT drop them just because they are absent from the new messages — the new messages are a delta, not the whole story.
- Deduplicate: fold overlapping facts together rather than repeating them.
- Only include information derivable from the wiki or the conversation. Korean/English mixed. Output ONLY the markdown — no preamble.`;
}

function extractSummary(content: string): string | null {
  const lines = content.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    return line.replace(/^[>*_`]+/, "").trim().slice(0, 200) || null;
  }
  return null;
}

export interface WikiGenerateResult {
  projectPath: string;
  /** Cumulative messages folded into the wiki across all generations. */
  messagesCovered: number;
  /** Messages folded in THIS generation. */
  foldedMessages: number;
  /** Messages still unfolded after this generation (backlog over budget). */
  pendingMessages: number;
  content: string;
  summary: string | null;
  model: WikiModel;
  claudeMd: { path: string; action: "created" | "replaced" | "appended" } | null;
  /** True when there was nothing new to fold — existing wiki returned as-is. */
  noChange: boolean;
}

export interface WikiPageResult {
  id: number;
  projectPath: string;
  content: string;
  messagesCovered: number;
  generatedAt: number;
  summary: string | null;
  model: string;
  lastMessageTs: number;
  lastMessageUuid: string;
  createdAt: Date;
  updatedAt: Date;
  /** Unfolded messages after the current watermark. */
  pendingMessages: number;
  isStale: boolean;
}

export interface GenerateOptions {
  /** Discard the existing wiki + watermark and re-synthesize from scratch. */
  reset?: boolean;
}

/**
 * Generate or incrementally update a project's wiki.
 *
 * Incremental by default: reads only messages after the stored watermark,
 * folds the oldest budget-sized chunk into the existing wiki via a reconciling
 * merge, and advances the watermark. This is what makes the wiki a cumulative
 * knowledge base (never forgets) instead of a rolling summary of recent chat.
 *
 * `reset: true` ignores the existing wiki/watermark and starts over.
 */
export async function generateProjectWiki(
  projectPath: string,
  model: WikiModel = "claude-opus-4-7",
  db: Db = getDb(),
  opts: GenerateOptions = {},
): Promise<WikiGenerateResult> {
  const existing = db
    .select()
    .from(projectWiki)
    .where(sql`${projectWiki.projectPath} = ${projectPath}`)
    .get();

  const reuse = !!existing && !opts.reset;
  const afterTs = reuse ? existing!.lastMessageTs : 0;
  const afterUuid = reuse ? existing!.lastMessageUuid : "";

  const delta = loadDeltaMessages(db, projectPath, afterTs, afterUuid);

  if (delta.length === 0) {
    if (reuse) {
      // Nothing new to fold — return the existing wiki untouched, no LLM call.
      return {
        projectPath,
        messagesCovered: existing!.messagesCovered,
        foldedMessages: 0,
        pendingMessages: 0,
        content: existing!.content,
        summary: existing!.summary,
        model: existing!.model as WikiModel,
        claudeMd: null,
        noChange: true,
      };
    }
    throw new Error(`No session messages found for project: ${projectPath}`);
  }

  const { selected, lastTs, lastUuid } = selectDelta(delta);
  const existingContent = reuse ? existing!.content : "";
  const projectName = projectPath.split("/").filter(Boolean).pop() ?? projectPath;

  // Bootstrap only: seed a fresh wiki with the project's compact summaries for
  // full-history breadth. In steady state the existing wiki IS the long-term
  // memory, so re-injecting summaries would be redundant + double-count.
  const memoriesPrelude = reuse ? "" : selectMemoriesPrelude(loadMemories(db, projectPath));

  // Self-correction: on the incremental path, fold the latest audit's actionable
  // findings into the prompt so the wiki fixes what its own eval flagged. The
  // bootstrap path has no wiki to have been audited yet.
  const audit = reuse ? getEval(projectPath, db) : null;
  const auditFindings = audit ? evalCorrectionHints(audit.report) : "";

  const prompt = buildPrompt(
    projectName,
    existingContent,
    selected,
    delta.length,
    memoriesPrelude,
    auditFindings,
  );
  // Wiki synthesis is the heaviest call in the brain — the model rewrites the
  // ENTIRE wiki (existing content + up to DELTA_BUDGET of new messages), so as
  // a wiki grows the default 3-minute callClaude timeout starts killing every
  // update, permanently wedging large projects. Give it room.
  const content = await callClaude(prompt, model, WIKI_TIMEOUT_MS);
  // Degenerate-output guard: throw WITHOUT advancing the watermark or touching
  // the stored wiki, so the next run retries the same delta against the intact
  // version instead of persisting a destroyed one.
  if (isDegenerateWikiOutput(content, reuse ? existing!.content : null)) {
    throw new Error(
      `위키 합성 결과가 비정상적으로 짧습니다 (${content.trim().length}자` +
        (reuse ? `, 기존 ${existing!.content.length}자` : "") +
        ") — 저장하지 않고 중단. LLM 응답 실패로 보이며 다음 갱신에서 재시도됩니다.",
    );
  }
  const summary = extractSummary(content);
  const now = Date.now();

  const prevCovered = reuse ? existing!.messagesCovered : 0;
  const messagesCovered = prevCovered + selected.length;

  // Snapshot the version we're about to overwrite so it can be rolled back.
  if (existing) archiveWikiVersion(db, existing);

  db.insert(projectWiki)
    .values({
      projectPath,
      content,
      messagesCovered,
      lastMessageTs: lastTs,
      lastMessageUuid: lastUuid,
      generatedAt: now,
      summary,
      model,
    })
    .onConflictDoUpdate({
      target: projectWiki.projectPath,
      set: {
        content,
        messagesCovered,
        lastMessageTs: lastTs,
        lastMessageUuid: lastUuid,
        generatedAt: now,
        summary,
        model,
        updatedAt: sql`(unixepoch() * 1000)`,
      },
    })
    .run();

  const pendingMessages = countPending(db, projectPath, lastTs, lastUuid);

  // Inject wiki into project's .claude/CLAUDE.md so Claude Code picks it up next
  // session — plus a memory index of the project's atomic notes so the rest of
  // the brain stays discoverable even when the wiki is char-capped.
  let claudeMd: WikiGenerateResult["claudeMd"] = null;
  try {
    const notes = getNotes(projectPath, db)?.notes ?? [];
    // Trust flag: the wiki's last self-eval score, so the next session knows how
    // far to rely on this persisted memory (never inject low trust unflagged).
    const evalScore = getEval(projectPath, db)?.report.score ?? null;
    const result = await injectWikiIntoCLAUDEMd(projectPath, content, now, notes, evalScore);
    claudeMd = { path: result.claudeMdPath, action: result.action };
  } catch {
    // Non-fatal — wiki is saved to DB regardless
  }

  return {
    projectPath,
    messagesCovered,
    foldedMessages: selected.length,
    pendingMessages,
    content,
    summary,
    model,
    claudeMd,
    noChange: false,
  };
}

export function getProjectWiki(projectPath: string, db: Db = getDb()): WikiPageResult | null {
  const row = db
    .select()
    .from(projectWiki)
    .where(sql`${projectWiki.projectPath} = ${projectPath}`)
    .get();
  if (!row) return null;

  const pendingMessages = countPending(db, projectPath, row.lastMessageTs, row.lastMessageUuid);
  return { ...row, pendingMessages, isStale: pendingMessages > 0 };
}

export function listProjectWikis(db: Db = getDb()): WikiPageResult[] {
  const rows = db
    .select()
    .from(projectWiki)
    .orderBy(sql`${projectWiki.generatedAt} DESC`)
    .all();

  return rows.map((row) => {
    const pendingMessages = countPending(db, row.projectPath, row.lastMessageTs, row.lastMessageUuid);
    return { ...row, pendingMessages, isStale: pendingMessages > 0 };
  });
}

export interface RollbackResult {
  projectPath: string;
  content: string;
  summary: string | null;
  model: string;
  messagesCovered: number;
  pendingMessages: number;
  generatedAt: number;
  claudeMd: { path: string; action: "created" | "replaced" | "appended" } | null;
}

/**
 * Restore a project's wiki to a snapshotted version. The current live version
 * is first archived (so the rollback is itself reversible), then the full state
 * — content AND watermark + messagesCovered — is restored, keeping the
 * incremental engine consistent. Finally CLAUDE.md is re-injected.
 *
 * Throws if the snapshot doesn't exist or belongs to a different project.
 */
export async function rollbackProjectWiki(
  projectPath: string,
  historyId: number,
  db: Db = getDb(),
): Promise<RollbackResult> {
  const entry = getWikiHistoryEntry(db, historyId);
  if (!entry) throw new Error(`Wiki history entry not found: ${historyId}`);
  if (entry.projectPath !== projectPath) {
    throw new Error(`History entry ${historyId} does not belong to ${projectPath}`);
  }

  const current = db
    .select()
    .from(projectWiki)
    .where(sql`${projectWiki.projectPath} = ${projectPath}`)
    .get();
  if (current) archiveWikiVersion(db, current);

  const now = Date.now();
  db.insert(projectWiki)
    .values({
      projectPath,
      content: entry.content,
      messagesCovered: entry.messagesCovered,
      lastMessageTs: entry.lastMessageTs,
      lastMessageUuid: entry.lastMessageUuid,
      generatedAt: entry.generatedAt,
      summary: entry.summary,
      model: entry.model,
    })
    .onConflictDoUpdate({
      target: projectWiki.projectPath,
      set: {
        content: entry.content,
        messagesCovered: entry.messagesCovered,
        lastMessageTs: entry.lastMessageTs,
        lastMessageUuid: entry.lastMessageUuid,
        generatedAt: entry.generatedAt,
        summary: entry.summary,
        model: entry.model,
        updatedAt: sql`(unixepoch() * 1000)`,
      },
    })
    .run();

  const pendingMessages = countPending(db, projectPath, entry.lastMessageTs, entry.lastMessageUuid);

  let claudeMd: RollbackResult["claudeMd"] = null;
  try {
    const result = await injectWikiIntoCLAUDEMd(projectPath, entry.content, now);
    claudeMd = { path: result.claudeMdPath, action: result.action };
  } catch {
    // Non-fatal
  }

  return {
    projectPath,
    content: entry.content,
    summary: entry.summary,
    model: entry.model,
    messagesCovered: entry.messagesCovered,
    pendingMessages,
    generatedAt: entry.generatedAt,
    claudeMd,
  };
}
