import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { projectWiki, type ProjectWikiRow } from "../../db/schema";
import { archiveWikiVersion, listWikiHistory, getWikiHistoryEntry } from "./wiki-history";
import { rollbackProjectWiki } from "./wiki";

function row(over: Partial<ProjectWikiRow> = {}): ProjectWikiRow {
  return {
    id: 1,
    projectPath: "/p",
    content: "content",
    summary: "sum",
    model: "claude-opus-4-7",
    messagesCovered: 3,
    lastMessageTs: 100,
    lastMessageUuid: "a",
    generatedAt: 1000,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  } as ProjectWikiRow;
}

describe("wiki history: archive / list / prune", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });
  afterEach(() => closeDb());

  it("archives a version with its full restorable state (no content in list)", () => {
    archiveWikiVersion(db, row({ content: "V1", messagesCovered: 7, lastMessageTs: 500 }));
    const list = listWikiHistory(db, "/p");
    expect(list).toHaveLength(1);
    expect(list[0].messagesCovered).toBe(7);
    expect(list[0].contentLength).toBe("V1".length);
    expect((list[0] as unknown as Record<string, unknown>).content).toBeUndefined();
    // full content available via getWikiHistoryEntry
    expect(getWikiHistoryEntry(db, list[0].id)!.content).toBe("V1");
  });

  it("prunes to the newest 20 snapshots per project", () => {
    for (let i = 0; i < 22; i++) archiveWikiVersion(db, row({ content: `v${i}` }));
    expect(listWikiHistory(db, "/p")).toHaveLength(20);
  });

  it("scopes history to the project", () => {
    archiveWikiVersion(db, row({ projectPath: "/a" }));
    archiveWikiVersion(db, row({ projectPath: "/b" }));
    expect(listWikiHistory(db, "/a")).toHaveLength(1);
    expect(listWikiHistory(db, "/b")).toHaveLength(1);
  });
});

describe("rollbackProjectWiki", () => {
  let db: Db;
  let dir: string;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-wiki-"));
  });
  afterEach(() => {
    closeDb();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("restores content AND watermark, and archives the version it replaced", async () => {
    // Current live wiki = V2 (watermark advanced).
    db.insert(projectWiki)
      .values({
        projectPath: dir,
        content: "V2 current",
        messagesCovered: 5,
        lastMessageTs: 200,
        lastMessageUuid: "b",
        generatedAt: 2000,
        summary: "v2",
        model: "claude-opus-4-7",
      })
      .run();
    // A prior snapshot = V1 (older watermark).
    archiveWikiVersion(
      db,
      row({ content: "V1 old", messagesCovered: 3, lastMessageTs: 100, lastMessageUuid: "a", generatedAt: 1000, projectPath: dir }),
    );
    const v1 = listWikiHistory(db, dir)[0];

    const res = await rollbackProjectWiki(dir, v1.id, db);

    expect(res.content).toBe("V1 old");
    expect(res.messagesCovered).toBe(3);

    const live = db.select().from(projectWiki).all()[0];
    expect(live.content).toBe("V1 old");
    expect(live.lastMessageTs).toBe(100); // watermark rewound, not left at 200
    expect(live.lastMessageUuid).toBe("a");
    expect(live.messagesCovered).toBe(3);

    // The replaced V2 is now archived → rollback is reversible.
    const hist = listWikiHistory(db, dir);
    expect(hist.some((h) => h.messagesCovered === 5)).toBe(true);

    // CLAUDE.md was written into the temp project dir.
    expect(res.claudeMd?.action).toBeTruthy();
    expect(fs.existsSync(path.join(dir, ".claude", "CLAUDE.md"))).toBe(true);
  });

  it("rejects a history id from a different project", async () => {
    archiveWikiVersion(db, row({ projectPath: "/other", content: "X" }));
    const other = listWikiHistory(db, "/other")[0];
    await expect(rollbackProjectWiki(dir, other.id, db)).rejects.toThrow(/does not belong/);
  });

  it("throws on a missing history id", async () => {
    await expect(rollbackProjectWiki(dir, 99999, db)).rejects.toThrow(/not found/);
  });
});
