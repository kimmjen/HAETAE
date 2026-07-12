import { describe, expect, it } from "vitest";
import { parseNotes, extractWikilinks, notesToGraph, buildPrompt } from "./notes";

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
