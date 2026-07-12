import { describe, expect, it } from "vitest";
import { capWikiForInjection, buildNotesIndexBlock, buildPersistentMemory, trustLine } from "./inject-wiki";
import type { AtomicNote } from "./notes";

const note = (slug: string, title: string, content: string): AtomicNote => ({ slug, title, content });

function section(header: string, chars: number): string {
  return `## ${header}\n${"x".repeat(chars)}`;
}

const WIKI = [
  "# MyProject",
  "한 줄 요약입니다.",
  "",
  section("개요 / Overview", 200),
  "",
  section("주요 기능 / Key Features", 200),
  "",
  section("기술 스택 / Tech Stack", 200),
  "",
  section("최근 작업 / Recent Work", 2000), // verbose, lowest priority
  "",
  section("결정 사항 / Decisions Made", 200),
  "",
  section("다음 단계 / Next Steps", 200),
].join("\n");

describe("capWikiForInjection", () => {
  it("returns the wiki unchanged when it fits the budget", () => {
    const small = "# P\n\n## 개요\nshort";
    expect(capWikiForInjection(small, 8000)).toBe(small.trim());
  });

  it("stays within the budget when over", () => {
    const out = capWikiForInjection(WIKI, 1200);
    expect(out.length).toBeLessThanOrEqual(1200);
    expect(WIKI.length).toBeGreaterThan(1200); // precondition: it really was over
  });

  it("keeps the high-priority tail sections (Decisions / Next Steps) and drops verbose Recent Work", () => {
    const out = capWikiForInjection(WIKI, 1200);
    expect(out).toContain("결정 사항");
    expect(out).toContain("다음 단계");
    expect(out).toContain("개요");
    // the 2000-char Recent Work section can't fit and is the lowest priority
    expect(out).not.toContain("최근 작업");
  });

  it("preserves the H1/preamble and original section order", () => {
    const out = capWikiForInjection(WIKI, 1200);
    expect(out.startsWith("# MyProject")).toBe(true);
    // 개요 appears before 결정 사항 (original document order, not priority order)
    expect(out.indexOf("개요")).toBeLessThan(out.indexOf("결정 사항"));
  });

  it("appends the summary note when sections were dropped", () => {
    expect(capWikiForInjection(WIKI, 1200)).toContain("요약본");
  });

  it("does not append the note when everything fits", () => {
    expect(capWikiForInjection(WIKI, 8000)).not.toContain("요약본");
  });

  it("falls back to truncated content when there are no sections", () => {
    const noSections = "# Title\n" + "y".repeat(5000);
    const out = capWikiForInjection(noSections, 1000);
    expect(out.length).toBeLessThanOrEqual(1000);
  });
});

describe("buildNotesIndexBlock", () => {
  it("lists note titles, most-connected (degree) first", () => {
    const notes = [
      note("a", "노트 A", "[[b]] [[c]]"), // degree 2 (links out)
      note("b", "노트 B", "x"), // degree 1 (linked from a)
      note("c", "노트 C", "[[b]]"), // degree 2 (a→c, c→b)
    ];
    const block = buildNotesIndexBlock(notes);
    expect(block).toContain("기억 인덱스");
    const order = ["노트 A", "노트 B", "노트 C"].map((t) => block.indexOf(t));
    // b is least connected (degree 1) → comes last among the three.
    expect(block.indexOf("노트 B")).toBeGreaterThan(block.indexOf("노트 A"));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("caps to budget and summarizes the remainder", () => {
    const many = Array.from({ length: 60 }, (_, i) => note(`n${i}`, `제목 ${i}`, ""));
    const block = buildNotesIndexBlock(many, 300);
    expect(block.length).toBeLessThanOrEqual(360); // header + lines + "…외 N개"
    expect(block).toMatch(/…외 \d+개/);
  });

  it("returns empty string for no notes", () => {
    expect(buildNotesIndexBlock([])).toBe("");
  });
});

describe("buildPersistentMemory", () => {
  it("with no notes is identical to the capped wiki (backward compatible)", () => {
    expect(buildPersistentMemory(WIKI, [], 8000)).toBe(capWikiForInjection(WIKI, 8000));
  });

  it("appends the note index to the wiki core", () => {
    const out = buildPersistentMemory(WIKI, [note("a", "워터마크 증분", "x")], 8000);
    expect(out).toContain("Overview"); // wiki prose kept
    expect(out).toContain("기억 인덱스");
    expect(out).toContain("워터마크 증분");
  });

  it("keeps the whole block within budget", () => {
    const notes = Array.from({ length: 30 }, (_, i) => note(`n${i}`, `제목 ${i}`, "[[n0]]"));
    const out = buildPersistentMemory(WIKI, notes, 1500);
    expect(out.length).toBeLessThanOrEqual(1500);
  });
});

describe("trustLine", () => {
  it("flags an un-audited memory when there is no eval score", () => {
    expect(trustLine(null)).toContain("미실시");
  });
  it("reports a high score plainly", () => {
    expect(trustLine(88)).toContain("88/100");
    expect(trustLine(88)).not.toContain("낮음");
  });
  it("adds a re-check hint for a middling score", () => {
    expect(trustLine(70)).toContain("재확인");
  });
  it("warns loudly for a low score", () => {
    const out = trustLine(40);
    expect(out).toContain("40/100");
    expect(out).toContain("낮음");
  });
});
