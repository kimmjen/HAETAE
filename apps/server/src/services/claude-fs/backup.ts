import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../../db";
import { fileBackups, type FileBackupRow } from "../../db/schema";

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Save a backup row for `relPath` within `scopeKey` if its content hash
 * differs from the most recent backup *in that scope*. Returns the row
 * representing the current state — either the new row or the existing
 * dedup target.
 */
export function saveBackup(
  db: Db,
  scopeKey: string,
  relPath: string,
  content: string,
): FileBackupRow {
  const contentHash = hashContent(content);

  const latest = db
    .select()
    .from(fileBackups)
    .where(and(eq(fileBackups.scope, scopeKey), eq(fileBackups.filePath, relPath)))
    .orderBy(desc(fileBackups.createdAt), desc(fileBackups.id))
    .limit(1)
    .all()[0];

  if (latest && latest.contentHash === contentHash) {
    return latest;
  }

  const inserted = db
    .insert(fileBackups)
    .values({ scope: scopeKey, filePath: relPath, content, contentHash })
    .returning()
    .all()[0];

  if (!inserted) {
    throw new Error(`Failed to insert backup for ${scopeKey}/${relPath}`);
  }
  return inserted;
}

export function listBackups(
  db: Db,
  scopeKey: string,
  relPath: string,
): FileBackupRow[] {
  return db
    .select()
    .from(fileBackups)
    .where(and(eq(fileBackups.scope, scopeKey), eq(fileBackups.filePath, relPath)))
    .orderBy(desc(fileBackups.createdAt), desc(fileBackups.id))
    .all();
}
