import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { sessionMessages } from "../../db/schema";

export interface SessionSearchHit {
  sessionId: string;
  projectPath: string;
  /** 'user' | 'assistant' */
  role: string;
  ts: number;
  snippet: string;
}

export interface SessionSearchOptions {
  q: string;
  projectPath?: string;
  days?: number;
  limit?: number;
}

const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 120;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
/** Trigram FTS needs 3+ chars; shorter queries fall back to LIKE. */
const FTS_MIN_CHARS = 3;

/** A short window around the first case-insensitive match, ellipsised at cuts. */
function makeSnippet(content: string, q: string): string {
  const i = content.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return content.slice(0, SNIPPET_BEFORE + SNIPPET_AFTER).trim();
  const start = Math.max(0, i - SNIPPET_BEFORE);
  const end = Math.min(content.length, i + q.length + SNIPPET_AFTER);
  return `${start > 0 ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}

function clampLimit(limit?: number): number {
  return Number.isFinite(limit) && (limit as number) > 0
    ? Math.min(Math.floor(limit as number), MAX_LIMIT)
    : DEFAULT_LIMIT;
}

function cutoffFor(days?: number): number | null {
  return Number.isFinite(days) && (days as number) > 0
    ? Date.now() - (days as number) * 86_400_000
    : null;
}

interface Row {
  sessionId: string;
  projectPath: string;
  role: string;
  ts: number;
  content: string | null;
}

function toHits(rows: Row[], q: string): SessionSearchHit[] {
  return rows.map((r) => ({
    sessionId: r.sessionId,
    projectPath: r.projectPath,
    role: r.role,
    ts: r.ts,
    snippet: makeSnippet(r.content ?? "", q),
  }));
}

/**
 * Cross-project full-text search over conversation messages (P7.2). Queries of
 * 3+ chars use the FTS5 trigram index (fast, substring + CJK, case-insensitive);
 * 1–2 char queries — below the trigram minimum — fall back to LIKE. Tool-use-only
 * turns (content IS NULL) and compact summaries are excluded.
 */
export function searchSessionMessages(
  opts: SessionSearchOptions,
  db: Db = getDb(),
): SessionSearchHit[] {
  const q = opts.q.trim();
  if (!q) return [];
  const limit = clampLimit(opts.limit);
  const cutoff = cutoffFor(opts.days);
  return charLength(q) >= FTS_MIN_CHARS
    ? searchFts(q, opts.projectPath, cutoff, limit, db)
    : searchLike(q, opts.projectPath, cutoff, limit, db);
}

/** Code points, not UTF-16 units — "😀a" is 2 chars, and sub-trigram queries
 *  must take the LIKE path or FTS silently returns nothing. */
function charLength(s: string): number {
  return [...s].length;
}

/** True when the query length crossed the trigram threshold (for meta.mode). */
export function searchMode(q: string): "fts5" | "like" {
  return charLength(q.trim()) >= FTS_MIN_CHARS ? "fts5" : "like";
}

function searchFts(
  q: string,
  projectPath: string | undefined,
  cutoff: number | null,
  limit: number,
  db: Db,
): SessionSearchHit[] {
  // Quote as a phrase so FTS5 treats the text literally (no operator parsing);
  // double internal quotes per FTS5 string escaping.
  const match = `"${q.replace(/"/g, '""')}"`;
  let where = sql`f.content MATCH ${match}
    AND sm.type IN ('user', 'assistant')
    AND sm.is_compact_summary = 0`;
  if (projectPath) where = sql`${where} AND sm.project_path = ${projectPath}`;
  if (cutoff !== null) where = sql`${where} AND sm.ts >= ${cutoff}`;

  const rows = db.all<Row>(sql`
    SELECT sm.session_id AS sessionId, sm.project_path AS projectPath,
           sm.type AS role, sm.ts AS ts, sm.content AS content
    FROM session_messages_fts f
    JOIN session_messages sm ON sm.id = f.rowid
    WHERE ${where}
    ORDER BY sm.ts DESC
    LIMIT ${limit}`);
  return toHits(rows, q);
}

function searchLike(
  q: string,
  projectPath: string | undefined,
  cutoff: number | null,
  limit: number,
  db: Db,
): SessionSearchHit[] {
  // Escape LIKE metacharacters so a literal % or _ is matched as a character.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const like = `%${escaped}%`;
  let where = sql`${sessionMessages.content} IS NOT NULL
    AND ${sessionMessages.type} IN ('user', 'assistant')
    AND ${sessionMessages.isCompactSummary} = 0
    AND ${sessionMessages.content} LIKE ${like} ESCAPE '\\'`;
  if (projectPath) where = sql`${where} AND ${sessionMessages.projectPath} = ${projectPath}`;
  if (cutoff !== null) where = sql`${where} AND ${sessionMessages.ts} >= ${cutoff}`;

  const rows = db
    .select({
      sessionId: sessionMessages.sessionId,
      projectPath: sessionMessages.projectPath,
      role: sessionMessages.type,
      ts: sessionMessages.ts,
      content: sessionMessages.content,
    })
    .from(sessionMessages)
    .where(where)
    .orderBy(sql`${sessionMessages.ts} DESC`)
    .limit(limit)
    .all();
  return toHits(rows, q);
}
