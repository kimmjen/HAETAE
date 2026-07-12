import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { projectNotes, projectWiki } from "../../db/schema";
import { callClaude, extractJson, type ClaudeModel } from "./claude-cli";
import { isDerivedStale, getWikiGeneratedAt } from "./staleness";
import type { GraphNode, GraphEdge, ProjectGraphData } from "./graph";

export interface AtomicNote {
  /** kebab-case id — wikilink target. */
  slug: string;
  title: string;
  /** Plain prose with inline [[slug]] wikilinks. */
  content: string;
}

const NOTE_COLOR = "#d97706";
const WIKILINK_COLOR = "#8b5cf688";

export function buildPrompt(
  projectName: string,
  wikiContent: string,
  existing: Array<{ slug: string; title: string }> = [],
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
- 8–30 notes, only ideas actually present in the wiki.
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
  model: ClaudeModel = "claude-opus-4-8",
  db: Db = getDb(),
): Promise<NotesResult> {
  const wiki = db
    .select({ content: projectWiki.content })
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
  const raw = await callClaude(buildPrompt(projectName, wiki.content, existing), model);
  const notes = parseNotes(raw);
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
