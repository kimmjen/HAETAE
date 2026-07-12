import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { sessionMessages } from "../../db/schema";
import { searchSessionMessages } from "./session-search";

describe("searchSessionMessages — cross-project conversation search", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });
  afterEach(() => closeDb());

  let uuidSeq = 0;
  const insert = (row: {
    sessionId: string;
    projectPath: string;
    type: string;
    content: string | null;
    ts: number;
    isCompactSummary?: boolean;
  }) =>
    db
      .insert(sessionMessages)
      .values({
        uuid: `u${uuidSeq++}`,
        sessionId: row.sessionId,
        projectPath: row.projectPath,
        type: row.type,
        content: row.content,
        ts: row.ts,
        isCompactSummary: row.isCompactSummary ?? false,
      })
      .run();

  it("returns empty for blank query", () => {
    insert({ sessionId: "s1", projectPath: "/a", type: "user", content: "hello world", ts: 100 });
    expect(searchSessionMessages({ q: "" }, db)).toEqual([]);
    expect(searchSessionMessages({ q: "   " }, db)).toEqual([]);
  });

  it("counts code points (not UTF-16 units) for the trigram threshold", () => {
    insert({ sessionId: "s1", projectPath: "/a", type: "user", content: "pair 😀a here", ts: 100 });
    // "😀a" is 2 chars but 3 UTF-16 units — must take the LIKE path and match
    // (the FTS path would silently return nothing for a sub-trigram phrase).
    expect(searchSessionMessages({ q: "😀a" }, db).map((h) => h.sessionId)).toEqual(["s1"]);
  });

  it("falls back to LIKE for sub-trigram (1–2 char) queries", () => {
    insert({ sessionId: "s1", projectPath: "/a", type: "user", content: "Go is great", ts: 100 });
    insert({ sessionId: "s2", projectPath: "/a", type: "user", content: "nothing here", ts: 200 });
    // "go" is 2 chars — below the trigram minimum, so the FTS path is skipped.
    const hits = searchSessionMessages({ q: "go" }, db);
    expect(hits.map((h) => h.sessionId)).toEqual(["s1"]);
  });

  it("matches content case-insensitively across projects, newest first", () => {
    insert({ sessionId: "s1", projectPath: "/a", type: "user", content: "워터마크 증분 설계", ts: 100 });
    insert({ sessionId: "s2", projectPath: "/b", type: "assistant", content: "Watermark incremental", ts: 200 });

    const hits = searchSessionMessages({ q: "watermark" }, db);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ sessionId: "s2", projectPath: "/b", role: "assistant" });

    const ko = searchSessionMessages({ q: "워터마크" }, db);
    expect(ko.map((h) => h.sessionId)).toEqual(["s1"]);
  });

  it("orders multiple hits by ts desc and respects limit", () => {
    insert({ sessionId: "s1", projectPath: "/a", type: "user", content: "alpha one", ts: 100 });
    insert({ sessionId: "s2", projectPath: "/a", type: "user", content: "alpha two", ts: 300 });
    insert({ sessionId: "s3", projectPath: "/a", type: "user", content: "alpha three", ts: 200 });

    const hits = searchSessionMessages({ q: "alpha" }, db);
    expect(hits.map((h) => h.sessionId)).toEqual(["s2", "s3", "s1"]);
    expect(searchSessionMessages({ q: "alpha", limit: 1 }, db)).toHaveLength(1);
  });

  it("filters by project and excludes tool-only / compact-summary rows", () => {
    insert({ sessionId: "s1", projectPath: "/a", type: "user", content: "needle here", ts: 100 });
    insert({ sessionId: "s2", projectPath: "/b", type: "user", content: "needle there", ts: 200 });
    insert({ sessionId: "s3", projectPath: "/a", type: "assistant", content: null, ts: 300 });
    insert({
      sessionId: "s4",
      projectPath: "/a",
      type: "assistant",
      content: "needle summary",
      ts: 400,
      isCompactSummary: true,
    });

    const hits = searchSessionMessages({ q: "needle", projectPath: "/a" }, db);
    expect(hits.map((h) => h.sessionId)).toEqual(["s1"]); // s3 null, s4 compact, s2 other project
  });

  it("coerces a bad limit instead of bypassing the cap or crashing", () => {
    insert({ sessionId: "s1", projectPath: "/a", type: "user", content: "alpha one", ts: 100 });
    insert({ sessionId: "s2", projectPath: "/a", type: "user", content: "alpha two", ts: 200 });
    insert({ sessionId: "s3", projectPath: "/a", type: "user", content: "alpha three", ts: 300 });

    // NaN / negative fall back to the default (no unbounded dump, no throw).
    expect(searchSessionMessages({ q: "alpha", limit: Number("x") }, db)).toHaveLength(3);
    expect(searchSessionMessages({ q: "alpha", limit: -5 }, db)).toHaveLength(3);
    // Fractional is floored, not passed raw to SQLite (which would throw).
    expect(searchSessionMessages({ q: "alpha", limit: 1.5 }, db)).toHaveLength(1);
  });

  it("treats LIKE metacharacters in the query as literals", () => {
    insert({ sessionId: "s1", projectPath: "/a", type: "user", content: "rate 50% done", ts: 100 });
    insert({ sessionId: "s2", projectPath: "/a", type: "user", content: "5099 tokens", ts: 200 });
    insert({ sessionId: "s3", projectPath: "/a", type: "user", content: "a_b literal", ts: 300 });
    insert({ sessionId: "s4", projectPath: "/a", type: "user", content: "axb wildcard", ts: 400 });

    // "%" literal → matches "50%", not "5099"; "_" literal → "a_b", not "axb".
    expect(searchSessionMessages({ q: "50%" }, db).map((h) => h.sessionId)).toEqual(["s1"]);
    expect(searchSessionMessages({ q: "a_b" }, db).map((h) => h.sessionId)).toEqual(["s3"]);
  });

  it("builds an ellipsised snippet around the match", () => {
    const long = `${"x".repeat(80)} TARGET ${"y".repeat(200)}`;
    insert({ sessionId: "s1", projectPath: "/a", type: "user", content: long, ts: 100 });

    const [hit] = searchSessionMessages({ q: "target" }, db);
    expect(hit.snippet).toContain("TARGET");
    expect(hit.snippet.startsWith("…")).toBe(true);
    expect(hit.snippet.endsWith("…")).toBe(true);
  });
});
