import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { projectWiki, projectNotes } from "../../db/schema";
import { isDerivedStale, getWikiGeneratedAt } from "./staleness";
import { getNotes } from "./notes";

describe("isDerivedStale", () => {
  it("위키가 파생물 이후 갱신됐으면 stale", () => {
    expect(isDerivedStale(100, 200)).toBe(true);
  });

  it("파생물이 위키와 같거나 더 최신이면 not stale", () => {
    expect(isDerivedStale(200, 200)).toBe(false);
    expect(isDerivedStale(300, 200)).toBe(false);
  });

  it("위키 시각을 모르면(null) stale 판정 안 함", () => {
    expect(isDerivedStale(100, null)).toBe(false);
  });
});

describe("derived staleness wiring (getNotes)", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });
  afterEach(() => closeDb());

  const insertWiki = (generatedAt: number) =>
    db
      .insert(projectWiki)
      .values({ projectPath: "/p", content: "w", model: "claude-opus-4-7", generatedAt })
      .onConflictDoUpdate({ target: projectWiki.projectPath, set: { generatedAt } })
      .run();

  const insertNotes = (generatedAt: number) =>
    db
      .insert(projectNotes)
      .values({
        projectPath: "/p",
        content: JSON.stringify({ notes: [{ slug: "a", title: "A", content: "x" }] }),
        model: "claude-opus-4-7",
        generatedAt,
      })
      .run();

  it("getWikiGeneratedAt 은 위키 시각 / 없으면 null", () => {
    expect(getWikiGeneratedAt("/p", db)).toBeNull();
    insertWiki(1000);
    expect(getWikiGeneratedAt("/p", db)).toBe(1000);
  });

  it("위키가 노트보다 최신이면 getNotes.isStale = true", () => {
    insertNotes(1000);
    insertWiki(2000);
    const res = getNotes("/p", db)!;
    expect(res.wikiGeneratedAt).toBe(2000);
    expect(res.isStale).toBe(true);
  });

  it("노트가 위키 이후면 not stale", () => {
    insertWiki(1000);
    insertNotes(2000);
    expect(getNotes("/p", db)!.isStale).toBe(false);
  });
});
