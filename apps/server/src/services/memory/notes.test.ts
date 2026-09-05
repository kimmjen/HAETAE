import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { sessionMessages } from "../../db/schema";
import {
  parseNotes,
  extractWikilinks,
  notesToGraph,
  buildPrompt,
  maxNotesFor,
  attachEvidence,
} from "./notes";

describe("maxNotesFor — 노트 상한 규모 비례 (#388)", () => {
  it("작은 프로젝트는 기본 30", () => {
    expect(maxNotesFor(0)).toBe(30);
    expect(maxNotesFor(5_000)).toBe(30);
  });
  it("큰 프로젝트는 비례 상향, 60에서 캡", () => {
    expect(maxNotesFor(14_000)).toBe(40);
    expect(maxNotesFor(100_000)).toBe(60);
  });
});

describe("attachEvidence — 근거 세션 부착 (#388)", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    const rows = [
      { uuid: "e1", sessionId: "sA", ts: 100, content: "워터마크 keyset 페이지네이션으로 증분 흡수한다" },
      { uuid: "e2", sessionId: "sB", ts: 200, content: "워터마크를 전진시키기 전에 degenerate 가드를 통과해야 한다" },
      { uuid: "e3", sessionId: "sC", ts: 300, content: "완전히 무관한 메시지 — 환율과 커피" },
    ];
    for (const r of rows) {
      db.insert(sessionMessages)
        .values({
          uuid: r.uuid,
          parentUuid: null,
          sessionId: r.sessionId,
          projectPath: "/p",
          type: "user",
          subtype: null,
          content: r.content,
          ts: r.ts,
          isCompactSummary: false,
        })
        .run();
    }
  });
  afterEach(() => closeDb());

  it("노트 키워드와 겹치는 세션을 evidence로 붙인다 (sessionId 중복 제거, ≤3)", () => {
    const notes = [{ slug: "watermark", title: "워터마크 증분", content: "워터마크 keyset 증분 흡수." }];
    const out = attachEvidence(notes, "/p", db);
    const ev = out[0].evidence ?? [];
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.length).toBeLessThanOrEqual(3);
    const ids = ev.map((e) => e.sessionId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("sA");
  });

  it("매칭이 없으면 evidence를 생략한다 (빈 배열 저장 안 함)", () => {
    const notes = [{ slug: "none", title: "zzz", content: "qqqxyz" }];
    const out = attachEvidence(notes, "/p", db);
    expect(out[0].evidence).toBeUndefined();
  });
});

describe("buildPrompt — 노트 상한 주입 (#388)", () => {
  it("maxNotes 파라미터가 규칙 문구에 반영된다", () => {
    expect(buildPrompt("proj", "wiki", [], 60)).toContain("8–60 notes");
    expect(buildPrompt("proj", "wiki")).toContain("8–30 notes");
  });
});

describe("buildPrompt — slug stability", () => {
  it("omits the existing-slugs block on first generation", () => {
    expect(buildPrompt("proj", "wiki")).not.toContain("EXISTING NOTE SLUGS");
  });
  it("passes prior slugs and instructs reuse on regeneration", () => {
    const p = buildPrompt("proj", "wiki", [{ slug: "watermark", title: "워터마크" }]);
    expect(p).toContain("EXISTING NOTE SLUGS");
    expect(p).toContain("watermark: 워터마크");
    expect(p).toMatch(/[Rr]euse an existing slug/);
  });
});

describe("parseNotes", () => {
  const good = JSON.stringify({
    notes: [
      { slug: "watermark", title: "워터마크 증분", content: "위키는 [[wiki]] 워터마크로 증분 흡수한다." },
      { slug: "wiki", title: "증분 위키", content: "프로젝트당 하나의 살아있는 문서." },
    ],
  });

  it("parses notes from fenced JSON", () => {
    const notes = parseNotes("```json\n" + good + "\n```");
    expect(notes.map((n) => n.slug).sort()).toEqual(["watermark", "wiki"]);
    expect(notes[0].title).toBe("워터마크 증분");
  });

  it("drops notes with missing or empty fields", () => {
    const raw = JSON.stringify({
      notes: [
        { slug: "ok", title: "OK", content: "내용" },
        { slug: "", title: "빈 슬러그", content: "x" },
        { slug: "no-title", content: "x" },
        { slug: "no-content", title: "제목만" },
      ],
    });
    expect(parseNotes(raw).map((n) => n.slug)).toEqual(["ok"]);
  });

  it("dedups duplicate slugs (first wins)", () => {
    const raw = JSON.stringify({
      notes: [
        { slug: "a", title: "첫번째", content: "x" },
        { slug: "a", title: "두번째", content: "y" },
      ],
    });
    const notes = parseNotes(raw);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("첫번째");
  });
});

describe("extractWikilinks", () => {
  it("extracts [[slug]] links in order", () => {
    expect(extractWikilinks("a는 [[b]]와 [[c]]에 의존한다")).toEqual(["b", "c"]);
  });

  it("takes the slug part of [[slug|alias]] and dedups", () => {
    expect(extractWikilinks("[[b|별칭]] 그리고 또 [[b]]")).toEqual(["b"]);
  });

  it("returns empty when no links", () => {
    expect(extractWikilinks("링크 없는 문장")).toEqual([]);
  });
});

describe("notesToGraph", () => {
  it("maps notes→nodes and resolved wikilinks→edges", () => {
    const g = notesToGraph([
      { slug: "a", title: "A", content: "[[b]] 참조" },
      { slug: "b", title: "B", content: "내용" },
    ]);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["note:a", "note:b"]);
    expect(g.nodes[0].type).toBe("note");
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].source).toBe("note:a");
    expect(g.edges[0].target).toBe("note:b");
    expect(g.edges[0].type).toBe("wikilink");
  });

  it("drops dangling links and self-links", () => {
    const g = notesToGraph([{ slug: "a", title: "A", content: "[[ghost]] [[a]]" }]);
    expect(g.edges).toHaveLength(0);
  });

  it("dedups repeated links between the same pair", () => {
    const g = notesToGraph([
      { slug: "a", title: "A", content: "[[b]] 그리고 [[b]]" },
      { slug: "b", title: "B", content: "x" },
    ]);
    expect(g.edges).toHaveLength(1);
  });

  it("sizes note nodes by link degree", () => {
    const g = notesToGraph([
      { slug: "hub", title: "Hub", content: "[[x]] [[y]]" },
      { slug: "x", title: "X", content: "내용" },
      { slug: "y", title: "Y", content: "내용" },
    ]);
    const hub = g.nodes.find((n) => n.id === "note:hub")!;
    const leaf = g.nodes.find((n) => n.id === "note:x")!;
    expect(hub.size).toBeGreaterThan(leaf.size);
  });
});
