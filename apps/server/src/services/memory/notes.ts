import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { projectNotes, projectWiki } from "../../db/schema";
import { callClaude, extractJson, DEFAULT_MODEL, type ClaudeModel } from "./claude-cli";
import { isDerivedStale, getWikiGeneratedAt } from "./staleness";
import { selectSources } from "./ask";
import type { GraphNode, GraphEdge, ProjectGraphData } from "./graph";

/** A session a note's fact traces back to — provenance for recall (#388). */
export interface NoteEvidence {
  sessionId: string;
  ts: number;
}

export interface AtomicNote {
  /** kebab-case id — wikilink target. */
  slug: string;
  title: string;
  /** Plain prose with inline [[slug]] wikilinks. */
  content: string;
  /** Source sessions this note's fact traces back to (≤3), keyword-matched at
      generation time — absent when nothing matched (older notes predate this). */
  evidence?: NoteEvidence[];
}

/** Full note-set rewrite from the full wiki — needs more than the 3m default. */
const NOTES_TIMEOUT_MS = 420_000;

const NOTE_COLOR = "#d97706";
const WIKILINK_COLOR = "#8b5cf688";

/** Base note cap; scales with project size up to MAX_NOTES_CEILING (#388). */
const MAX_NOTES_BASE = 30;
const MAX_NOTES_CEILING = 60;
/** One extra note slot per this many covered messages past the base. */
const MESSAGES_PER_NOTE = 350;

/**
 * Note cap proportional to project size: a project with tens of thousands of
 * covered messages holds more than 30 distinct ideas — the fixed cap was
 * flattening large brains. 30 until ~10.5k messages, then +1 per 350, cap 60.
 */
export function maxNotesFor(messagesCovered: number): number {
  return Math.min(
    MAX_NOTES_CEILING,
    Math.max(MAX_NOTES_BASE, Math.round(messagesCovered / MESSAGES_PER_NOTE)),
  );
}

export function buildPrompt(
  projectName: string,
  wikiContent: string,
  existing: Array<{ slug: string; title: string }> = [],
  maxNotes = MAX_NOTES_BASE,
): string {
  // Identifier stability: notes are regenerated wholesale from the wiki, so
  // without this the agent mints fresh slugs every run — churning vault files,
  // graph node ids, and note→concept links. Reuse the slug for a persisting idea.
  const existingBlock = existing.length
    ? `EXISTING NOTE SLUGS (reuse the SAME slug for an idea still present — keep identifiers stable across regenerations; mint a new slug only for a genuinely new idea; an idea no longer in the wiki simply disappears):
${existing.map((n) => `- ${n.slug}: ${n.title}`).join("\n")}

`
    : "";
  return `You are splitting a project wiki into ATOMIC NOTES (Zettelkasten). Each note captures exactly ONE idea — a decision, concept, problem, or mechanism — and links to related notes with [[slug]] wikilinks inline.

PROJECT: ${projectName}

WIKI:
${wikiContent}

${existingBlock}---

Output ONLY valid JSON (no markdown fences, no prose) shaped exactly as:
{
  "notes": [{ "slug": "kebab-case-slug", "title": "짧은 제목", "content": "2–5문장 평문. 관련 노트는 [[other-slug]] 인라인 링크." }]
}

Rules:
- 8–${maxNotes} notes, only ideas actually present in the wiki.
- ONE idea per note — split compound topics into separate notes.
- Reuse an existing slug above when the idea persists (stable identifiers); a new slug only for a new idea.
- Every [[slug]] MUST reference another note's slug in this same output.
- Aim for a connected web: most notes should link to 1–3 related notes.
- content is plain prose (no headings, no lists), Korean or English as the wiki uses.
- Output JSON only.`;
}

/**
 * Parse + validate the model's notes JSON. Tolerant of fences/prose. Drops
 * notes missing slug/title/content and dedups slugs (first wins) so wikilink
 * targets are unambiguous.
 */
export function parseNotes(raw: string): AtomicNote[] {
  const data = extractJson<{ notes?: unknown }>(raw);
  if (!Array.isArray(data.notes)) return [];

  const seen = new Set<string>();
  const notes: AtomicNote[] = [];
  for (const n of data.notes as AtomicNote[]) {
    if (
      !n ||
      typeof n.slug !== "string" || !n.slug.trim() ||
      typeof n.title !== "string" || !n.title.trim() ||
      typeof n.content !== "string" || !n.content.trim()
    ) {
      continue;
    }
    const slug = n.slug.trim();
    if (seen.has(slug)) continue;
    seen.add(slug);
    notes.push({ slug, title: n.title.trim(), content: n.content });
  }
  return notes;
}

/** Evidence sessions per note. */
const MAX_EVIDENCE = 3;

/**
 * Attach source sessions to each note by keyword-matching its text against the
 * project's conversation messages — the same deterministic retrieval ask uses
 * (selectSources), no extra LLM call. Notes with no match stay evidence-free
 * rather than carrying an empty array.
 */
// ponytail: one LIKE table scan per note (30-60 per regen) — a few seconds as
// a post-LLM pass; switch to the FTS5 index if note counts or DB size make it hurt.
export function attachEvidence(
  notes: AtomicNote[],
  projectPath: string,
  db: Db = getDb(),
): AtomicNote[] {
  return notes.map((note) => {
    const sources = selectSources(db, projectPath, `${note.title} ${note.content}`);
    const seen = new Set<string>();
    const evidence: NoteEvidence[] = [];
    for (const s of sources) {
      if (seen.has(s.sessionId)) continue;
      seen.add(s.sessionId);
      evidence.push({ sessionId: s.sessionId, ts: s.ts });
      if (evidence.length >= MAX_EVIDENCE) break;
    }
    return evidence.length > 0 ? { ...note, evidence } : note;
  });
}

/** Unique [[slug]] targets in a note's content, in order. Supports [[slug|alias]]. */
export function extractWikilinks(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    const slug = m[1].trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

/**
 * Convert notes into the shared GraphNode/GraphEdge shape. Wikilinks pointing
 * to unknown slugs (dangling) and self-links are dropped so the graph is
 * always internally consistent.
 */
export function notesToGraph(notes: AtomicNote[]): ProjectGraphData {
  const slugs = new Set(notes.map((n) => n.slug));

  const edgeSet = new Set<string>();
  const degree = new Map<string, number>();
  const edges: GraphEdge[] = [];
  for (const note of notes) {
    for (const target of extractWikilinks(note.content)) {
      if (!slugs.has(target) || target === note.slug) continue;
      const k = `${note.slug}|${target}`;
      if (edgeSet.has(k)) continue;
      edgeSet.add(k);
      degree.set(note.slug, (degree.get(note.slug) ?? 0) + 1);
      degree.set(target, (degree.get(target) ?? 0) + 1);
      edges.push({
        id: `wl:${note.slug}:${target}`,
        source: `note:${note.slug}`,
        target: `note:${target}`,
        weight: 1.5,
        type: "wikilink",
        color: WIKILINK_COLOR,
      });
    }
  }

  const nodes: GraphNode[] = notes.map((n) => ({
    id: `note:${n.slug}`,
    type: "note",
    label: n.title,
    size: Math.max(5, Math.min(18, 5 + (degree.get(n.slug) ?? 0) * 2)),
    color: NOTE_COLOR,
  }));

  return { nodes, edges };
}

export interface NotesResult {
  projectPath: string;
  notes: AtomicNote[];
  graph: ProjectGraphData;
  model: string;
  generatedAt: number;
  /** Wiki's last generation time — the source these notes were split from. */
  wikiGeneratedAt: number | null;
  /** True when the wiki has been regenerated since these notes were built. */
  isStale: boolean;
}

function rowToResult(
  row: { projectPath: string; content: string; model: string; generatedAt: number },
  wikiGeneratedAt: number | null,
): NotesResult {
  const notes = (JSON.parse(row.content) as { notes: AtomicNote[] }).notes;
  return {
    projectPath: row.projectPath,
    notes,
    graph: notesToGraph(notes),
    model: row.model,
    generatedAt: row.generatedAt,
    wikiGeneratedAt,
    isStale: isDerivedStale(row.generatedAt, wikiGeneratedAt),
  };
}

/** Every project's stored notes — the substrate for cross-project recall. */
export function getAllNotes(db: Db = getDb()): Array<{ projectPath: string; notes: AtomicNote[] }> {
  return db
    .select({ projectPath: projectNotes.projectPath, content: projectNotes.content })
    .from(projectNotes)
    .all()
    .map((row) => ({
      projectPath: row.projectPath,
      notes: (JSON.parse(row.content) as { notes: AtomicNote[] }).notes,
    }));
}

/** Stored atomic notes for a project, or null if not yet generated. */
export function getNotes(projectPath: string, db: Db = getDb()): NotesResult | null {
  const row = db
    .select()
    .from(projectNotes)
    .where(sql`${projectNotes.projectPath} = ${projectPath}`)
    .get();
  return row ? rowToResult(row, getWikiGeneratedAt(projectPath, db)) : null;
}

/**
 * Split (or re-split) a project's wiki into atomic notes via the agent, store
 * them, and return the wikilink graph. Requires the wiki to exist — the wiki
 * is the distilled source the notes are split from.
 */
export async function generateNotes(
  projectPath: string,
  model: ClaudeModel = DEFAULT_MODEL,
  db: Db = getDb(),
): Promise<NotesResult> {
  const wiki = db
    .select({ content: projectWiki.content, messagesCovered: projectWiki.messagesCovered })
    .from(projectWiki)
    .where(sql`${projectWiki.projectPath} = ${projectPath}`)
    .get();
  if (!wiki) {
    throw new Error("위키가 없습니다 — 원자 노트는 위키를 쪼개서 만드므로 위키를 먼저 생성하세요.");
  }

  const projectName = projectPath.split("/").filter(Boolean).pop() ?? projectPath;
  // Pass the prior notes so the agent reuses slugs for persisting ideas
  // (identifier stability — avoids churning the vault / graph / links on regen).
  const existing = getNotes(projectPath, db)?.notes.map((n) => ({ slug: n.slug, title: n.title })) ?? [];
  // The note split rewrites the WHOLE note set from the WHOLE wiki, so like
  // wiki synthesis it outgrows the 3-minute default as a wiki grows — a
  // KPG-advance cascade regen timed out at exactly 180s (2026-07-30). Give it
  // headroom; ontology/eval read the same wiki but emit far less, so they stay
  // on the default.
  const raw = await callClaude(
    buildPrompt(projectName, wiki.content, existing, maxNotesFor(wiki.messagesCovered)),
    model,
    NOTES_TIMEOUT_MS,
  );
  // Provenance pass (#388): trace each note back to its source sessions so
  // recall results are verifiable instead of trust-me prose.
  const notes = attachEvidence(parseNotes(raw), projectPath, db);
  const now = Date.now();

  db.insert(projectNotes)
    .values({ projectPath, content: JSON.stringify({ notes }), model, generatedAt: now })
    .onConflictDoUpdate({
      target: projectNotes.projectPath,
      set: {
        content: JSON.stringify({ notes }),
        model,
        generatedAt: now,
        updatedAt: sql`(unixepoch() * 1000)`,
      },
    })
    .run();

  const wikiGeneratedAt = getWikiGeneratedAt(projectPath, db);
  return {
    projectPath,
    notes,
    graph: notesToGraph(notes),
    model,
    generatedAt: now,
    wikiGeneratedAt,
    isStale: isDerivedStale(now, wikiGeneratedAt),
  };
}
