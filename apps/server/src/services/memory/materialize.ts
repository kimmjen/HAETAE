import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { memories, sessionMessages } from "../../db/schema";

/**
 * Sync compact summaries from session_messages → memories.
 *
 * Joins the anchor (is_compact_summary=1) with its parent compact_boundary
 * to retrieve trigger + token counts. Only rows not yet in memories are
 * inserted — idempotent, safe to call after every indexAll().
 */
export function materializeCompactMemories(db: Db = getDb()): number {
  const rows = db
    .select({
      summaryUuid: sessionMessages.uuid,
      sessionId: sessionMessages.sessionId,
      projectPath: sessionMessages.projectPath,
      content: sessionMessages.content,
      ts: sessionMessages.ts,
    })
    .from(sessionMessages)
    .where(
      sql`${sessionMessages.isCompactSummary} = 1
        AND ${sessionMessages.content} IS NOT NULL
        AND ${sessionMessages.uuid} NOT IN (
          SELECT summary_uuid FROM ${memories} WHERE summary_uuid IS NOT NULL
        )`,
    )
    .all();

  if (rows.length === 0) return 0;

  // For each anchor, fetch its parent compact_boundary for metadata.
  const anchorUuids = rows.map((r) => r.summaryUuid);
  const anchorRows = db
    .select({
      uuid: sessionMessages.uuid,
      parentUuid: sessionMessages.parentUuid,
    })
    .from(sessionMessages)
    .where(sql`${sessionMessages.uuid} IN (${sql.join(anchorUuids.map((u) => sql`${u}`), sql`, `)})`)
    .all();

  const parentUuidByAnchor = new Map(anchorRows.map((r) => [r.uuid, r.parentUuid]));
  const parentUuids = [...new Set(anchorRows.map((r) => r.parentUuid).filter(Boolean))] as string[];

  let boundaryMap = new Map<string, { trigger: string | null; preTokens: number | null; postTokens: number | null }>();
  if (parentUuids.length > 0) {
    const boundaries = db
      .select({
        uuid: sessionMessages.uuid,
        compactTrigger: sessionMessages.compactTrigger,
        compactPreTokens: sessionMessages.compactPreTokens,
        compactPostTokens: sessionMessages.compactPostTokens,
      })
      .from(sessionMessages)
      .where(sql`${sessionMessages.uuid} IN (${sql.join(parentUuids.map((u) => sql`${u}`), sql`, `)})`)
      .all();

    boundaryMap = new Map(
      boundaries.map((b) => [b.uuid, { trigger: b.compactTrigger, preTokens: b.compactPreTokens, postTokens: b.compactPostTokens }]),
    );
  }

  db.transaction((tx) => {
    for (const row of rows) {
      const parentUuid = parentUuidByAnchor.get(row.summaryUuid) ?? null;
      const boundary = parentUuid ? boundaryMap.get(parentUuid) : undefined;
      tx.insert(memories)
        .values({
          summaryUuid: row.summaryUuid,
          sessionId: row.sessionId,
          projectPath: row.projectPath,
          content: row.content!,
          source: "compact_summary",
          compactTrigger: boundary?.trigger ?? null,
          compactPreTokens: boundary?.preTokens ?? null,
          compactPostTokens: boundary?.postTokens ?? null,
          ts: row.ts,
        })
        .onConflictDoNothing()
        .run();
    }
  });

  return rows.length;
}
