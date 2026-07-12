import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { projectWikiHistory, type ProjectWikiRow, type ProjectWikiHistoryRow } from "../../db/schema";

/** Max snapshots kept per project; oldest beyond this are pruned. */
const MAX_HISTORY = 20;

/**
 * Snapshot a wiki row into history before it is overwritten, then prune the
 * project's history to the newest MAX_HISTORY entries. Idempotent in the sense
 * that callers only invoke it when an existing row is about to be replaced.
 */
export function archiveWikiVersion(db: Db, row: ProjectWikiRow): void {
  db.insert(projectWikiHistory)
    .values({
      projectPath: row.projectPath,
      content: row.content,
      summary: row.summary,
      model: row.model,
      messagesCovered: row.messagesCovered,
      lastMessageTs: row.lastMessageTs,
      lastMessageUuid: row.lastMessageUuid,
      generatedAt: row.generatedAt,
    })
    .run();

  // Prune: keep the newest MAX_HISTORY rows for this project.
  db.run(sql`
    DELETE FROM ${projectWikiHistory}
    WHERE ${projectWikiHistory.projectPath} = ${row.projectPath}
      AND ${projectWikiHistory.id} NOT IN (
        SELECT id FROM ${projectWikiHistory}
        WHERE ${projectWikiHistory.projectPath} = ${row.projectPath}
        ORDER BY ${projectWikiHistory.archivedAt} DESC, ${projectWikiHistory.id} DESC
        LIMIT ${MAX_HISTORY}
      )
  `);
}

export interface WikiHistoryEntry {
  id: number;
  projectPath: string;
  summary: string | null;
  model: string;
  messagesCovered: number;
  generatedAt: number;
  archivedAt: number;
  /** Length of the snapshotted content — UI shows size without shipping it all. */
  contentLength: number;
}

/** List a project's snapshots, newest-archived first (no content payload). */
export function listWikiHistory(db: Db = getDb(), projectPath: string): WikiHistoryEntry[] {
  const rows = db
    .select()
    .from(projectWikiHistory)
    .where(sql`${projectWikiHistory.projectPath} = ${projectPath}`)
    .orderBy(sql`${projectWikiHistory.archivedAt} DESC, ${projectWikiHistory.id} DESC`)
    .all();

  return rows.map((r) => ({
    id: r.id,
    projectPath: r.projectPath,
    summary: r.summary,
    model: r.model,
    messagesCovered: r.messagesCovered,
    generatedAt: r.generatedAt,
    archivedAt: r.archivedAt instanceof Date ? r.archivedAt.getTime() : r.archivedAt,
    contentLength: r.content.length,
  }));
}

/** Fetch a single snapshot by id (full content), or null. */
export function getWikiHistoryEntry(db: Db, id: number): ProjectWikiHistoryRow | null {
  return (
    db
      .select()
      .from(projectWikiHistory)
      .where(sql`${projectWikiHistory.id} = ${id}`)
      .get() ?? null
  );
}
