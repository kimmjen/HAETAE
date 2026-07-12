import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { sessionMessages, projectWiki } from "../../db/schema";
import { selectAutoWikiCandidates, newestMessageTs, readAutoWikiConfig, getAutoWikiStatus, type AutoWikiConfig } from "./auto-wiki";

const NOW = 10_000_000;
const CFG: AutoWikiConfig = { debounceMs: 1_000, cooldownMs: 5_000 };

function addWiki(
  db: Db,
  projectPath: string,
  opts: { generatedAt: number; lastMessageTs?: number; lastMessageUuid?: string; model?: string },
) {
  db.insert(projectWiki)
    .values({
      projectPath,
      content: "# wiki",
      messagesCovered: 1,
      lastMessageTs: opts.lastMessageTs ?? 0,
      lastMessageUuid: opts.lastMessageUuid ?? "",
      generatedAt: opts.generatedAt,
      model: opts.model ?? "claude-opus-4-7",
    })
    .run();
}

function addMsg(db: Db, projectPath: string, uuid: string, ts: number) {
  db.insert(sessionMessages)
    .values({
      uuid,
      parentUuid: null,
      sessionId: "s",
      projectPath,
      type: "user",
      subtype: null,
      content: "hello",
      ts,
      isCompactSummary: false,
    })
    .run();
}

describe("selectAutoWikiCandidates", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });
  afterEach(() => closeDb());

  it("includes a wiki that is stale, settled, and past cooldown", () => {
    addWiki(db, "/eligible", { generatedAt: NOW - 6_000 }); // past 5s cooldown
    addMsg(db, "/eligible", "e1", 100); // pending (> watermark 0), newest=100 → settled
    const out = selectAutoWikiCandidates(db, NOW, CFG);
    expect(out.map((c) => c.projectPath)).toEqual(["/eligible"]);
    expect(out[0].pendingMessages).toBe(1);
  });

  it("excludes a wiki still within its cooldown window", () => {
    addWiki(db, "/cooldown", { generatedAt: NOW - 1_000 }); // < 5s cooldown
    addMsg(db, "/cooldown", "c1", 100);
    expect(selectAutoWikiCandidates(db, NOW, CFG)).toHaveLength(0);
  });

  it("excludes a project that is not settled (recent message)", () => {
    addWiki(db, "/active", { generatedAt: NOW - 6_000 });
    addMsg(db, "/active", "a1", NOW - 500); // newer than debounce (1s) → mid-session
    expect(selectAutoWikiCandidates(db, NOW, CFG)).toHaveLength(0);
  });

  it("excludes a wiki that is already caught up (no pending messages)", () => {
    addWiki(db, "/fresh", { generatedAt: NOW - 6_000, lastMessageTs: 100, lastMessageUuid: "f1" });
    addMsg(db, "/fresh", "f1", 100); // watermark already at this message → pending 0
    expect(selectAutoWikiCandidates(db, NOW, CFG)).toHaveLength(0);
  });

  it("orders eligible candidates stalest-first (oldest generatedAt)", () => {
    addWiki(db, "/newer", { generatedAt: NOW - 6_000 });
    addMsg(db, "/newer", "n1", 100);
    addWiki(db, "/older", { generatedAt: NOW - 9_000 });
    addMsg(db, "/older", "o1", 100);
    expect(selectAutoWikiCandidates(db, NOW, CFG).map((c) => c.projectPath)).toEqual([
      "/older",
      "/newer",
    ]);
  });

  it("falls back to a safe model when the stored model is unknown", () => {
    addWiki(db, "/legacy", { generatedAt: NOW - 6_000, model: "gpt-legacy" });
    addMsg(db, "/legacy", "l1", 100);
    expect(selectAutoWikiCandidates(db, NOW, CFG)[0].model).toBe("claude-opus-4-7");
  });
});

describe("newestMessageTs", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });
  afterEach(() => closeDb());

  it("returns the max real-message ts, 0 when none", () => {
    expect(newestMessageTs(db, "/p")).toBe(0);
    addMsg(db, "/p", "a", 100);
    addMsg(db, "/p", "b", 300);
    addMsg(db, "/p", "c", 200);
    expect(newestMessageTs(db, "/p")).toBe(300);
  });
});

describe("readAutoWikiConfig / getAutoWikiStatus", () => {
  const KEYS = ["HAETAE_WIKI_AUTO", "HAETAE_WIKI_AUTO_INTERVAL_MS"] as const;
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("enabled only when HAETAE_WIKI_AUTO is exactly 'true'; defaults otherwise", () => {
    delete process.env.HAETAE_WIKI_AUTO;
    expect(readAutoWikiConfig().enabled).toBe(false);
    expect(readAutoWikiConfig().intervalMs).toBe(300_000);
    process.env.HAETAE_WIKI_AUTO = "true";
    process.env.HAETAE_WIKI_AUTO_INTERVAL_MS = "60000";
    const c = readAutoWikiConfig();
    expect(c.enabled).toBe(true);
    expect(c.intervalMs).toBe(60_000);
  });

  it("getAutoWikiStatus returns config + empty candidates when nothing is eligible", () => {
    const db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    try {
      delete process.env.HAETAE_WIKI_AUTO;
      const status = getAutoWikiStatus(db);
      expect(status.config.enabled).toBe(false);
      expect(status.candidates).toEqual([]);
    } finally {
      closeDb();
    }
  });
});
