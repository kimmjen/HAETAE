import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import { projectRoots, type ProjectRootRow } from "../../db/schema";
import { getProjectRoots } from "./discover";

export class InvalidPathError extends Error {
  constructor(public readonly attempted: string, message: string) {
    super(message);
    this.name = "InvalidPathError";
  }
}

export class DuplicateRootError extends Error {
  constructor(public readonly absolutePath: string, public readonly source: "env" | "user") {
    super(`Project root already registered (${source}): ${absolutePath}`);
    this.name = "DuplicateRootError";
  }
}

export class RootNotFoundError extends Error {
  constructor(public readonly id: number) {
    super(`Project root not found: id=${id}`);
    this.name = "RootNotFoundError";
  }
}

/**
 * Validate + insert a user-added project root.
 *
 * Rejects when:
 * - the path is not absolute
 * - it doesn't exist or isn't a directory
 * - it duplicates an env entry (env wins, no point storing a shadow)
 * - it duplicates a DB entry (UNIQUE constraint also enforces, but we
 *   want a typed error not a raw SQLITE_CONSTRAINT message)
 */
export async function addProjectRoot(
  db: Db,
  absolutePath: string,
): Promise<ProjectRootRow> {
  const trimmed = absolutePath.trim();
  if (trimmed.length === 0) {
    throw new InvalidPathError(absolutePath, "path is empty");
  }
  if (!path.isAbsolute(trimmed)) {
    throw new InvalidPathError(absolutePath, "path must be absolute");
  }
  const resolved = path.resolve(trimmed);

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new InvalidPathError(absolutePath, "path does not exist");
  }
  if (!stat.isDirectory()) {
    throw new InvalidPathError(absolutePath, "path is not a directory");
  }

  if (getProjectRoots().includes(resolved)) {
    throw new DuplicateRootError(resolved, "env");
  }

  const existing = db
    .select()
    .from(projectRoots)
    .where(eq(projectRoots.absolutePath, resolved))
    .limit(1)
    .all()[0];
  if (existing) {
    throw new DuplicateRootError(resolved, "user");
  }

  const inserted = db
    .insert(projectRoots)
    .values({ absolutePath: resolved })
    .returning()
    .all()[0];

  if (!inserted) {
    throw new Error(`Failed to insert project root for ${resolved}`);
  }
  return inserted;
}

/** Delete a user-added root by id. Throws RootNotFoundError if missing. */
export function deleteProjectRoot(db: Db, id: number): void {
  const removed = db
    .delete(projectRoots)
    .where(eq(projectRoots.id, id))
    .returning()
    .all();
  if (removed.length === 0) {
    throw new RootNotFoundError(id);
  }
}
