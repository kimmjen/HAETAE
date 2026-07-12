import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { sessionMessages } from "../../db/schema";
import { questionKeywords, selectSources, buildPrompt } from "./ask";

describe("questionKeywords", () => {
  it("extracts meaningful tokens, drops stopwords and short tokens", () => {
    const kw = questionKeywords("워터마크는 어떻게 동작해?");
    expect(kw).toContain("워터마크는"); // crude split keeps particle, still LIKE-matches
    expect(kw).not.toContain("어떻게");
  });
  it("dedups and caps at 8", () => {
    const kw = questionKeywords("a b c d e f g h i j wiki wiki");
    expect(kw.length).toBeLessThanOrEqual(8);
    expect(new Set(kw).size).toBe(kw.length);
  });
  it("returns empty for an all-stopword question", () => {
    expect(questionKeywords("how is the")).toEqual([]);
  });
});

describe("selectSources", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    const seed = (uuid: string, ts: number, content: string) =>
      db
        .insert(sessionMessages)
        .values({ uuid, parentUuid: null, sessionId: "s1", projectPath: "/p", type: "assistant", subtype: null, content, ts, isCompactSummary: false })
        .run();
    seed("m1", 100, "워터마크로 증분 흡수를 구현했다");
    seed("m2", 200, "워터마크 워터마크 keyset 페이지네이션"); // more hits
    seed("m3", 300, "전혀 관련 없는 내용");
  });
  afterEach(() => closeDb());

  it("returns keyword-matching messages, scored by hit count, tagged S1..", () => {
    const s = selectSources(db, "/p", "워터마크 동작?");
    expect(s.map((x) => x.tag)).toEqual(["S1", "S2"]); // 2 matches, m3 excluded
    // m2 has more "워터마크" hits → ranked first
    expect(s[0].snippet).toContain("keyset");
  });

  it("returns empty when the question has no usable keywords", () => {
    expect(selectSources(db, "/p", "how is the")).toEqual([]);
  });
});

describe("buildPrompt", () => {
  it("includes wiki + tagged excerpts + question and asks for citations (wiki fallback)", () => {
    const p = buildPrompt(
      { kind: "wiki", content: "WIKI BODY" },
      [{ tag: "S1", sessionId: "abc", ts: 0, snippet: "excerpt text" }],
      "질문?",
    );
    expect(p).toContain("WIKI BODY");
    expect(p).toContain("[W]");
    expect(p).toContain("[S1]");
    expect(p).toContain("excerpt text");
    expect(p).toContain("질문?");
    expect(p).toMatch(/cite|출처/i);
  });
  it("notes when there is no wiki", () => {
    expect(buildPrompt({ kind: "wiki", content: null }, [], "q")).toContain("위키 없음");
  });
  it("uses the notes block + [N] tags when given notes", () => {
    const p = buildPrompt(
      { kind: "notes", block: "[N1] 워터마크\n증분 흡수" },
      [],
      "질문?",
    );
    expect(p).toContain("[N1] 워터마크");
    expect(p).toContain("NOTES");
    expect(p).not.toContain("WIKI [W]");
  });
});
