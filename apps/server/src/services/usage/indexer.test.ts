import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { usageEvents, usageFileCursor } from "../../db/schema";
import { indexAll, indexFile } from "./indexer";

const CLAUDE_HOME_ENV = "HAETAE_CLAUDE_HOME";

function makeAssistantLine(opts: {
  sessionId?: string;
  messageId: string;
  model?: string;
  ts?: string;
  input?: number;
  output?: number;
}): string {
  return JSON.stringify({
    type: "assistant",
    timestamp: opts.ts ?? "2026-05-03T10:00:00.000Z",
    sessionId: opts.sessionId ?? "sess-1",
    message: {
      id: opts.messageId,
      model: opts.model ?? "claude-sonnet-4-6",
      role: "assistant",
      usage: {
        input_tokens: opts.input ?? 100,
        output_tokens: opts.output ?? 200,
        cache_creation_input_tokens: 50,
        cache_read_input_tokens: 25,
      },
    },
  });
}

describe("indexer", () => {
  let originalHome: string | undefined;
  let claudeHome: string;
  let db: Db;

  beforeEach(() => {
    originalHome = process.env[CLAUDE_HOME_ENV];
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-indexer-"));
    process.env[CLAUDE_HOME_ENV] = claudeHome;
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
    if (originalHome === undefined) delete process.env[CLAUDE_HOME_ENV];
    else process.env[CLAUDE_HOME_ENV] = originalHome;
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  function makeFile(lines: string[]): string {
    const dir = path.join(claudeHome, "projects", "-x-Alpha");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "sess.jsonl");
    fs.writeFileSync(file, lines.join("\n") + "\n");
    return file;
  }
  const projectPath = "/x/Alpha";
  const rowCount = () => db.select().from(usageEvents).all().length;

  describe("indexFile", () => {
    it("inserts every billable line on a fresh file (mode=fresh)", async () => {
      const file = makeFile([
        JSON.stringify({ type: "permission-mode" }),
        makeAssistantLine({ messageId: "m1" }),
        makeAssistantLine({ messageId: "m2", model: "claude-opus-4-7" }),
      ]);

      const r = await indexFile(file, projectPath, db);
      expect(r.mode).toBe("fresh");
      expect(r.inserted).toBe(2);
      expect(rowCount()).toBe(2);
    });

    it("is idempotent — re-running with no file changes inserts 0 (mode=skipped)", async () => {
      const file = makeFile([makeAssistantLine({ messageId: "m1" })]);
      await indexFile(file, projectPath, db);
      const before = rowCount();
      const r = await indexFile(file, projectPath, db);
      expect(r.mode).toBe("skipped");
      expect(r.inserted).toBe(0);
      expect(rowCount()).toBe(before);
    });

    it("indexes only newly-appended lines on the second run (mode=incremental)", async () => {
      const file = makeFile([makeAssistantLine({ messageId: "m1" })]);
      await indexFile(file, projectPath, db);
      // Append two more lines without rewriting the file.
      fs.appendFileSync(
        file,
        makeAssistantLine({ messageId: "m2" }) +
          "\n" +
          makeAssistantLine({ messageId: "m3" }) +
          "\n",
      );

      const r = await indexFile(file, projectPath, db);
      expect(r.mode).toBe("incremental");
      expect(r.inserted).toBe(2);
      expect(rowCount()).toBe(3);
    });

    it("rewinds and reparses when the file mtime regresses (rotation/backup)", async () => {
      const file = makeFile([
        makeAssistantLine({ messageId: "m1" }),
        makeAssistantLine({ messageId: "m2" }),
      ]);
      await indexFile(file, projectPath, db);
      expect(rowCount()).toBe(2);

      // Replace with a fresh file containing one new message id.
      fs.writeFileSync(
        file,
        makeAssistantLine({ messageId: "fresh-1" }) + "\n",
      );
      // Force older mtime so the rewind branch triggers.
      const past = Math.floor(Date.now() / 1000) - 3600;
      fs.utimesSync(file, past, past);

      const r = await indexFile(file, projectPath, db);
      expect(r.mode).toBe("rewind");
      // Old m1/m2 still in DB (UNIQUE just dedupes), fresh-1 added.
      expect(r.inserted).toBe(1);
      expect(rowCount()).toBe(3);
    });

    it("UNIQUE(session_id, message_id) prevents double-counting on cursor mishap", async () => {
      const file = makeFile([
        makeAssistantLine({ messageId: "dup", sessionId: "s" }),
      ]);
      await indexFile(file, projectPath, db);
      // Forge: wipe the cursor so the indexer thinks the file is fresh.
      // The UNIQUE index should still keep `dup` from being inserted twice.
      db.delete(usageFileCursor).run();
      const r = await indexFile(file, projectPath, db);
      expect(r.mode).toBe("fresh");
      expect(r.inserted).toBe(0);
      expect(rowCount()).toBe(1);
    });

    it("stores cost as integer micro-USD so sums stay exact", async () => {
      const file = makeFile([
        makeAssistantLine({
          messageId: "m1",
          model: "claude-sonnet-4-6",
          input: 1_000_000,
          output: 0,
        }),
      ]);
      await indexFile(file, projectPath, db);
      const row = db.select().from(usageEvents).get();
      // Sonnet input $3 / Mtok → 1Mtok input = $3 → 3_000_000 micro,
      // plus cache_creation 50 * 3.75 + cache_read 25 * 0.3 = 195.
      expect(row?.costUsdMicro).toBe(3 * 1_000_000 + Math.round(50 * 3.75 + 25 * 0.3));
    });

    it("returns mode=skipped for missing files", async () => {
      const r = await indexFile("/tmp/__not-here-haetae__/x.jsonl", "/x", db);
      expect(r.mode).toBe("skipped");
      expect(r.inserted).toBe(0);
    });
  });

  describe("indexAll", () => {
    it("walks every project dir under ~/.claude/projects/ and indexes its jsonl files", async () => {
      const projA = path.join(claudeHome, "projects", "-tmp-a");
      const projB = path.join(claudeHome, "projects", "-tmp-b");
      fs.mkdirSync(projA, { recursive: true });
      fs.mkdirSync(projB, { recursive: true });
      fs.writeFileSync(
        path.join(projA, "sess-a1.jsonl"),
        makeAssistantLine({ messageId: "a1-m1", sessionId: "a1" }),
      );
      fs.writeFileSync(
        path.join(projA, "sess-a2.jsonl"),
        makeAssistantLine({ messageId: "a2-m1", sessionId: "a2" }),
      );
      fs.writeFileSync(
        path.join(projB, "sess-b1.jsonl"),
        makeAssistantLine({ messageId: "b1-m1", sessionId: "b1" }),
      );
      fs.writeFileSync(path.join(projB, "stray.txt"), "not a jsonl");

      const result = await indexAll(db);
      expect(result.filesScanned).toBe(3);
      expect(result.totalInserted).toBe(3);
      expect(rowCount()).toBe(3);

      const paths = db
        .select({ p: usageEvents.projectPath })
        .from(usageEvents)
        .all()
        .map((r) => r.p);
      expect(paths.sort()).toEqual(["/tmp/a", "/tmp/a", "/tmp/b"]);
    });

    it("returns an empty result when ~/.claude/projects/ does not exist", async () => {
      const result = await indexAll(db);
      expect(result.filesScanned).toBe(0);
      expect(result.totalInserted).toBe(0);
    });

    it("matches an encoded dir against a user-registered root to recover dashes", async () => {
      // Register a root whose basename has a real dash — Claude Code's
      // encoding flattens it (Beta-Sim → -Beta-Sim-...) so the
      // lossy decode would be `Beta/Sim`. With the lookup we must
      // recover the exact registered path.
      const realRoot = "/tmp/Beta-Sim";
      const { projectRoots } = await import("../../db/schema");
      db.insert(projectRoots).values({ absolutePath: realRoot }).run();

      const encoded = realRoot.replace(/\//g, "-");
      const dir = path.join(claudeHome, "projects", encoded);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "s.jsonl"),
        makeAssistantLine({ messageId: "m", sessionId: "s" }),
      );

      await indexAll(db);
      const row = db.select({ p: usageEvents.projectPath }).from(usageEvents).get();
      expect(row?.p).toBe("/tmp/Beta-Sim");
    });

    it("backfills pre-existing rows that were stored with the lossy decoding", async () => {
      const realRoot = "/tmp/Beta-Sim";
      const lossy = "/tmp/Beta/Sim";
      const { projectRoots } = await import("../../db/schema");
      db.insert(projectRoots).values({ absolutePath: realRoot }).run();

      // Seed a row written by a previous (buggy) indexer run.
      db.insert(usageEvents)
        .values({
          sessionId: "old",
          messageId: "m",
          projectPath: lossy,
          model: "claude-sonnet-4-6",
          ts: Date.now(),
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          costUsdMicro: 0,
        })
        .run();

      await indexAll(db);
      const row = db.select({ p: usageEvents.projectPath }).from(usageEvents).get();
      expect(row?.p).toBe(realRoot);
    });
  });
});
