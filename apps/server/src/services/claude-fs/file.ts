import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { Db } from "../../db";
import { assertSafePath } from "./guard";
import { saveBackup } from "./backup";

export interface ReadFileResult {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  mtime: number;
}

export interface WriteFileResult extends ReadFileResult {
  backupId: number;
}

export class FileNotFoundError extends Error {
  constructor(public readonly relPath: string) {
    super(`File not found: ${relPath}`);
    this.name = "FileNotFoundError";
  }
}

export class StaleMtimeError extends Error {
  constructor(
    public readonly relPath: string,
    public readonly expectedMtime: number,
    public readonly actualMtime: number,
  ) {
    super(
      `File ${relPath} changed on disk (expected mtime ${expectedMtime}, actual ${actualMtime})`,
    );
    this.name = "StaleMtimeError";
  }
}

export class FileAlreadyExistsError extends Error {
  constructor(public readonly relPath: string) {
    super(`File already exists: ${relPath}`);
    this.name = "FileAlreadyExistsError";
  }
}

export class InvalidFileExtensionError extends Error {
  constructor(public readonly relPath: string) {
    super(`Only .md files can be created here: ${relPath}`);
    this.name = "InvalidFileExtensionError";
  }
}

export async function readFile(home: string, relPath: string): Promise<ReadFileResult> {
  const abs = assertSafePath(home, relPath);
  let raw: string;
  let mtime: number;
  try {
    raw = await fs.readFile(abs, "utf8");
    const stat = await fs.stat(abs);
    mtime = stat.mtimeMs;
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      throw new FileNotFoundError(relPath);
    }
    throw err;
  }

  const parsed = matter(raw);
  return {
    path: relPath,
    content: parsed.content,
    frontmatter: parsed.data as Record<string, unknown>,
    mtime,
  };
}

/**
 * Write `content` to `relPath`, preserving any frontmatter the caller
 * provides as part of the body. Steps:
 *
 * 1. Resolve and verify the path is inside `home`.
 * 2. Verify the on-disk mtime matches expectedMtime — refuse otherwise.
 * 3. Append a backup row (scoped by `scopeKey`) with the *previous*
 *    file contents.
 * 4. Atomic write: write to <abs>.tmp, then rename over the target.
 * 5. Re-read the file to return canonical mtime + parsed frontmatter.
 */
export async function writeFile(
  db: Db,
  home: string,
  scopeKey: string,
  relPath: string,
  content: string,
  expectedMtime: number,
): Promise<WriteFileResult> {
  const abs = assertSafePath(home, relPath);

  let previousContent: string | null = null;
  try {
    const stat = await fs.stat(abs);
    const actualMtime = stat.mtimeMs;
    if (Math.abs(actualMtime - expectedMtime) > 1) {
      throw new StaleMtimeError(relPath, expectedMtime, actualMtime);
    }
    previousContent = await fs.readFile(abs, "utf8");
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      throw new FileNotFoundError(relPath);
    }
    throw err;
  }

  const backupRow = saveBackup(db, scopeKey, relPath, previousContent);

  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, abs);

  const fresh = await readFile(home, relPath);
  return { ...fresh, backupId: backupRow.id };
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

/**
 * Create a new markdown file at `relPath` with the given `content`.
 *
 * Only .md targets are accepted (the rules tree filters non-.md leaves
 * out anyway). Refuses if the file already exists — callers that want
 * \"upsert\" should use writeFile, which has explicit mtime conflict
 * handling. Parents are created on demand so callers can write straight
 * to e.g. `skills/new-thing.md` without first making `skills/`.
 */
export async function createFile(
  _db: Db,
  home: string,
  relPath: string,
  content: string,
): Promise<ReadFileResult> {
  if (!relPath.toLowerCase().endsWith(".md")) {
    throw new InvalidFileExtensionError(relPath);
  }
  const abs = assertSafePath(home, relPath);

  try {
    await fs.stat(abs);
    throw new FileAlreadyExistsError(relPath);
  } catch (err) {
    if (err instanceof FileAlreadyExistsError) throw err;
    if (!isErrnoException(err) || err.code !== "ENOENT") throw err;
  }

  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, abs);

  return await readFile(home, relPath);
}
