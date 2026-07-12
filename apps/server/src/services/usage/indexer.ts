import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { createReadStream } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { usageEvents, usageFileCursor, sessionMessages } from "../../db/schema";
import { getClaudeHome } from "../claude-fs/path";
import { discoverProjects } from "../projects/discover";
import { calculateCost } from "./pricing";
import {
  decodeProjectDir,
  parseLine,
  parseLineToMessage,
  type UsageEvent,
  type SessionMessage,
} from "./jsonl-parser";
import { materializeCompactMemories } from "../memory/materialize";

/**
 * Build a lookup from Claude Code's encoded directory name back to the
 * exact absolute path the user registered. Necessary because the
 * encoding (`/` → `-`) is lossy: a real `Foo-Bar` segment becomes
 * indistinguishable from `Foo/Bar` when reading the dir name.
 *
 * Returns a map keyed by the encoded form. Callers that miss the lookup
 * fall back to `decodeProjectDir`, which is correct for paths without
 * dashes inside any segment.
 */
function buildEncodedToAbsoluteMap(roots: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of roots) m.set(r.replace(/\//g, "-"), r);
  return m;
}

/**
 * Convert a UsageEvent's cost (USD) to integer micro-USD for storage.
 * SQLite never sees floats this way — sums and aggregations stay exact.
 */
function toMicroUsd(usd: number): number {
  return Math.round(usd * 1_000_000);
}

export interface IndexFileResult {
  filePath: string;
  /** Newly inserted rows (after dedupe). */
  inserted: number;
  /** Lines we attempted to parse this run (excludes lines below cursor). */
  scanned: number;
  /** Bytes processed this run. */
  bytesRead: number;
  /** Why we did this — "fresh" (no cursor), "incremental" (cursor advanced),
      "rewind" (mtime went back / file shrank), "skipped" (no change). */
  mode: "fresh" | "incremental" | "rewind" | "skipped";
}

/**
 * Index one JSONL file into `usage_events`. Idempotent — calling it
 * twice with no file changes is a noop. The (session_id, message_id)
 * UNIQUE constraint guarantees dedupe even if the cursor logic somehow
 * misses a tail.
 *
 * Reads the file in append mode: only bytes after the recorded
 * `last_offset` are streamed, then the cursor advances. If the file
 * shrank or its mtime regressed (rotation, restored backup) we wipe
 * the cursor and reparse from byte 0.
 */
export async function indexFile(
  absPath: string,
  projectPath: string,
  db: Db = getDb(),
): Promise<IndexFileResult> {
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    return { filePath: absPath, inserted: 0, scanned: 0, bytesRead: 0, mode: "skipped" };
  }
  const currentMtime = stat.mtimeMs;
  const currentSize = stat.size;

  const cursorRow = db
    .select()
    .from(usageFileCursor)
    .where(sql`${usageFileCursor.filePath} = ${absPath}`)
    .get();

  let mode: IndexFileResult["mode"];
  let startOffset: number;
  if (!cursorRow) {
    mode = "fresh";
    startOffset = 0;
  } else if (currentMtime < cursorRow.lastMtime || currentSize < cursorRow.lastOffset) {
    // File rotated / restored / truncated — start over.
    mode = "rewind";
    startOffset = 0;
  } else if (currentMtime === cursorRow.lastMtime && currentSize === cursorRow.lastOffset) {
    // Nothing changed since last run.
    return {
      filePath: absPath,
      inserted: 0,
      scanned: 0,
      bytesRead: 0,
      mode: "skipped",
    };
  } else {
    mode = "incremental";
    startOffset = cursorRow.lastOffset;
  }

  const sessionIdFallback = path.basename(absPath, ".jsonl");
  const events: UsageEvent[] = [];
  const messages: SessionMessage[] = [];
  let scanned = 0;
  let bytesRead = 0;

  const stream = createReadStream(absPath, {
    encoding: "utf8",
    start: startOffset,
    end: currentSize - 1, // inclusive
  });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      bytesRead += Buffer.byteLength(line, "utf8") + 1; // +1 for the newline
      if (line.length === 0) continue;
      scanned += 1;
      const ev = parseLine(line, projectPath, sessionIdFallback);
      if (ev) events.push(ev);
      const msg = parseLineToMessage(line, projectPath, sessionIdFallback);
      if (msg) messages.push(msg);
    }
  } finally {
    rl.close();
    stream.close();
  }

  let inserted = 0;
  if (events.length > 0) inserted = insertEvents(db, events);
  if (messages.length > 0) insertMessages(db, messages);
  upsertCursor(db, absPath, currentSize, currentMtime);

  return { filePath: absPath, inserted, scanned, bytesRead, mode };
}

export interface IndexAllResult {
  filesScanned: number;
  totalInserted: number;
  perFile: IndexFileResult[];
}

/**
 * Walk every `~/.claude/projects/<encoded>/` directory and incrementally
 * index any `.jsonl` file inside. Errors on individual files are caught
 * so one malformed log can't stop the whole run.
 *
 * Project paths are resolved against the user's registered project_roots
 * to recover dashes that the encoding flattens (`Foo-Bar` vs
 * `Foo/Bar`). Backfills any pre-existing rows that were stored
 * with the lossy decoding.
 */
export async function indexAll(db: Db = getDb()): Promise<IndexAllResult> {
  const knownRoots = (await discoverProjects(db)).map((p) => p.absolutePath);
  const exactByEncoded = buildEncodedToAbsoluteMap(knownRoots);

  // One-shot backfill of rows previously written with the lossy decoding.
  // Idempotent (matches 0 rows once cleaned), and runs even when the
  // jsonl tree is empty so DBs from older indexer versions get fixed.
  for (const [encoded, exact] of exactByEncoded) {
    const lossy = decodeProjectDir(encoded);
    if (lossy !== exact) {
      db.update(usageEvents)
        .set({ projectPath: exact })
        .where(sql`${usageEvents.projectPath} = ${lossy}`)
        .run();
    }
  }

  const projectsRoot = path.join(getClaudeHome(), "projects");
  let dirs: string[];
  try {
    dirs = await fs.readdir(projectsRoot);
  } catch {
    return { filesScanned: 0, totalInserted: 0, perFile: [] };
  }

  const perFile: IndexFileResult[] = [];
  for (const dir of dirs) {
    const projectPath = exactByEncoded.get(dir) ?? decodeProjectDir(dir);
    const dirAbs = path.join(projectsRoot, dir);
    let entries: string[];
    try {
      entries = await fs.readdir(dirAbs);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const filePath = path.join(dirAbs, name);
      try {
        const result = await indexFile(filePath, projectPath, db);
        perFile.push(result);
      } catch {
        // Bad single file — keep going.
      }
    }
  }

  const totalInserted = perFile.reduce((s, r) => s + r.inserted, 0);
  materializeCompactMemories(db);
  return { filesScanned: perFile.length, totalInserted, perFile };
}

/**
 * Bulk INSERT OR IGNORE — duplicates on (session_id, message_id) are
 * silently skipped so re-indexing the same JSONL is idempotent. Returns
 * the number of rows actually written. Wrapped in a transaction so a
 * mid-batch crash doesn't leave the cursor ahead of what was persisted.
 */
function insertEvents(db: Db, events: UsageEvent[]): number {
  return db.transaction((tx) => {
    let inserted = 0;
    for (const ev of events) {
      const result = tx
        .insert(usageEvents)
        .values({
          sessionId: ev.sessionId,
          messageId: ev.messageId,
          projectPath: ev.projectPath,
          model: ev.model,
          ts: ev.ts,
          inputTokens: ev.inputTokens,
          outputTokens: ev.outputTokens,
          cacheCreationTokens: ev.cacheCreationTokens,
          cacheReadTokens: ev.cacheReadTokens,
          costUsdMicro: toMicroUsd(ev.costUsd),
        })
        .onConflictDoNothing()
        .run();
      if (result.changes > 0) inserted += 1;
    }
    return inserted;
  });
}

function insertMessages(db: Db, messages: SessionMessage[]): void {
  db.transaction((tx) => {
    for (const m of messages) {
      tx.insert(sessionMessages)
        .values({
          uuid: m.uuid,
          parentUuid: m.parentUuid,
          sessionId: m.sessionId,
          projectPath: m.projectPath,
          type: m.type,
          subtype: m.subtype,
          content: m.content,
          ts: m.ts,
          isCompactSummary: m.isCompactSummary,
          compactTrigger: m.compactTrigger,
          compactPreTokens: m.compactPreTokens,
          compactPostTokens: m.compactPostTokens,
        })
        .onConflictDoNothing()
        .run();
    }
  });
}

function upsertCursor(db: Db, filePath: string, lastOffset: number, lastMtime: number): void {
  db.insert(usageFileCursor)
    .values({ filePath, lastOffset, lastMtime })
    .onConflictDoUpdate({
      target: usageFileCursor.filePath,
      set: { lastOffset, lastMtime },
    })
    .run();
}

// Re-export for convenience: tests + future API code want a single
// pricing function rather than wiring through both files.
export { calculateCost };
