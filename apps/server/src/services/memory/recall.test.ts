import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  scoreNote,
  selectRelevantNotes,
  buildNotesBlock,
  buildNoteIndex,
  parseSelectedSlugs,
  selectRelevantNotesSemantic,
  buildGlobalNoteIndex,
  selectRelevantNotesGlobal,
  type GlobalNote,
} from "./recall";
import { callClaude } from "./claude-cli";
import type { AtomicNote } from "./notes";

// selectRelevantNotesSemantic delegates meaning-based seeding to claude -p;
// mock that one subprocess boundary so the test is deterministic + offline.
vi.mock("./claude-cli", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./claude-cli")>();
  return { ...actual, callClaude: vi.fn() };
});

const note = (slug: string, title: string, content: string): AtomicNote => ({
  slug,
  title,
  content,
});

describe("scoreNote", () => {
  it("weights title hits higher than body", () => {
    const t = scoreNote(note("a", "watermark sync", "x"), ["watermark"]);
    const b = scoreNote(note("b", "x", "watermark watermark"), ["watermark"]);
    expect(t).toBeGreaterThan(0);
    expect(b).toBe(2); // two body hits, no title
    expect(t).toBe(3); // one title hit ×3
  });
  it("is 0 with no keywords or no match", () => {
    expect(scoreNote(note("a", "t", "c"), [])).toBe(0);
    expect(scoreNote(note("a", "t", "c"), ["zzz"])).toBe(0);
  });
});

describe("selectRelevantNotes", () => {
  it("seeds by keyword match", () => {
    const notes = [
      note("wm", "워터마크 증분", "위키는 워터마크로 증분 흡수"),
      note("ui", "프론트 UI", "react 컴포넌트"),
    ];
    const out = selectRelevantNotes(notes, "워터마크 어떻게 동작?");
    expect(out.map((s) => s.note.slug)).toContain("wm");
    expect(out.find((s) => s.note.slug === "wm")?.hop).toBe(0);
    expect(out.map((s) => s.note.slug)).not.toContain("ui");
  });

  it("expands wikilinks one hop from seeds", () => {
    const notes = [
      note("wm", "워터마크", "[[cursor]] 로 증분"),
      note("cursor", "커서", "keyset 커서 페이지네이션"),
      note("far", "무관", "관계없음"),
    ];
    const out = selectRelevantNotes(notes, "워터마크");
    const slugs = out.map((s) => s.note.slug);
    expect(slugs).toContain("wm"); // seed
    expect(slugs).toContain("cursor"); // hop 1
    expect(out.find((s) => s.note.slug === "cursor")?.hop).toBe(1);
    expect(slugs).not.toContain("far");
  });

  it("returns empty when no keyword match (caller falls back to wiki)", () => {
    const notes = [note("a", "사과", "바나나")];
    expect(selectRelevantNotes(notes, "zzz 전혀없음")).toEqual([]);
  });

  it("returns empty for empty notes", () => {
    expect(selectRelevantNotes([], "질문")).toEqual([]);
  });

  it("respects maxNotes cap", () => {
    const notes = Array.from({ length: 30 }, (_, i) =>
      note(`n${i}`, `키워드 노트 ${i}`, "키워드 본문"),
    );
    const out = selectRelevantNotes(notes, "키워드", { maxNotes: 5 });
    expect(out.length).toBe(5);
  });

  it("respects char budget", () => {
    const big = "키워드 " + "x".repeat(30_000);
    const notes = [note("a", "키워드", big), note("b", "키워드", big)];
    const out = selectRelevantNotes(notes, "키워드", { budget: 35_000 });
    expect(out.length).toBe(1); // second would overflow
  });

  it("is safe against cycles", () => {
    const notes = [
      note("a", "키워드 에이", "[[b]]"),
      note("b", "비", "[[a]]"), // cycle a→b→a
    ];
    const out = selectRelevantNotes(notes, "키워드");
    // terminates, each note at most once
    expect(out.map((s) => s.note.slug).sort()).toEqual(["a", "b"]);
  });

  it("ignores dangling wikilinks", () => {
    const notes = [note("a", "키워드", "[[ghost]] 없는 링크")];
    const out = selectRelevantNotes(notes, "키워드");
    expect(out.map((s) => s.note.slug)).toEqual(["a"]); // ghost dropped
  });
});

describe("buildNoteIndex", () => {
  it("lists every note as a [slug] title — preview line", () => {
    const idx = buildNoteIndex([
      note("wm", "워터마크 증분", "위키는 워터마크로 증분 흡수한다"),
      note("ui", "프론트 UI", "react 컴포넌트"),
    ]);
    expect(idx).toContain("[wm] 워터마크 증분");
    expect(idx).toContain("[ui] 프론트 UI");
    expect(idx).toContain("증분 흡수"); // preview from content
  });
});

describe("parseSelectedSlugs", () => {
  const valid = ["a", "b", "c"];
  it("keeps valid slugs in order, drops unknown + dupes", () => {
    const raw = '{"slugs": ["b", "ghost", "a", "b"]}';
    expect(parseSelectedSlugs(raw, valid)).toEqual(["b", "a"]);
  });
  it("tolerates fences/prose and non-array → empty", () => {
    expect(parseSelectedSlugs("```json\n{\"slugs\":[\"c\"]}\n```", valid)).toEqual(["c"]);
    expect(parseSelectedSlugs("그냥 텍스트", valid)).toEqual([]);
    expect(parseSelectedSlugs('{"slugs": "a"}', valid)).toEqual([]);
  });
});

describe("selectRelevantNotesSemantic", () => {
  beforeEach(() => vi.mocked(callClaude).mockReset());
  afterEach(() => vi.mocked(callClaude).mockReset());

  const notes = [
    note("oauth", "OAuth 한도 조회", "[[keychain]] 에서 토큰 읽어 사용 한도 조회"),
    note("keychain", "키체인 자격증명", "security 명령으로 OAuth 토큰 읽음"),
    note("ui", "그래프 색상", "Louvain 군집 색"),
  ];

  it("seeds from the LLM-selected slugs (meaning, not keyword) then expands wikilinks", async () => {
    vi.mocked(callClaude).mockResolvedValue('{"slugs": ["oauth"]}');
    // "인증" never appears literally in the notes — keyword seeding would miss it.
    const out = await selectRelevantNotesSemantic(notes, "인증은 어떻게 처리해?", "claude-opus-4-8");
    const slugs = out.map((s) => s.note.slug);
    expect(slugs).toContain("oauth"); // LLM-picked seed
    expect(slugs).toContain("keychain"); // pulled in via [[keychain]] wikilink
    expect(slugs).not.toContain("ui");
    expect(out.find((s) => s.note.slug === "oauth")?.hop).toBe(0);
  });

  it("returns empty when the model selects nothing (caller falls back)", async () => {
    vi.mocked(callClaude).mockResolvedValue('{"slugs": []}');
    expect(await selectRelevantNotesSemantic(notes, "관계없는 질문", "claude-opus-4-8")).toEqual([]);
  });

  it("passes the note index (titles) to the model", async () => {
    vi.mocked(callClaude).mockResolvedValue('{"slugs": []}');
    await selectRelevantNotesSemantic(notes, "q", "claude-opus-4-8");
    const prompt = vi.mocked(callClaude).mock.calls[0][0] as string;
    expect(prompt).toContain("[oauth] OAuth 한도 조회");
    expect(prompt).toContain("q");
  });
});

describe("cross-project (global) recall", () => {
  beforeEach(() => vi.mocked(callClaude).mockReset());
  afterEach(() => vi.mocked(callClaude).mockReset());

  const globals: GlobalNote[] = [
    { projectPath: "/a/HAETAE", projectName: "HAETAE", note: note("oauth", "OAuth 한도", "키체인에서 토큰") },
    { projectPath: "/b/Alpha", projectName: "Alpha", note: note("oauth", "전력 OAuth", "다른 프로젝트의 동명 slug") },
    { projectPath: "/b/Alpha", projectName: "Alpha", note: note("grid", "계통 안정도", "주파수 응답") },
  ];

  it("indexes notes as [project/slug] so same slug across projects can't collide", () => {
    const idx = buildGlobalNoteIndex(globals);
    expect(idx).toContain("[HAETAE/oauth] OAuth 한도");
    expect(idx).toContain("[Alpha/oauth] 전력 OAuth");
    expect(idx).toContain("[Alpha/grid] 계통 안정도");
  });

  it("returns the agent-picked notes across projects, in rank order", async () => {
    vi.mocked(callClaude).mockResolvedValue('{"slugs": ["Alpha/grid", "HAETAE/oauth", "ghost/x"]}');
    const out = await selectRelevantNotesGlobal(globals, "주파수와 인증?", "claude-opus-4-8");
    expect(out.map((g) => `${g.projectName}/${g.note.slug}`)).toEqual(["Alpha/grid", "HAETAE/oauth"]);
  });

  it("empty selection / empty corpus → []", async () => {
    vi.mocked(callClaude).mockResolvedValue('{"slugs": []}');
    expect(await selectRelevantNotesGlobal(globals, "무관", "claude-opus-4-8")).toEqual([]);
    expect(await selectRelevantNotesGlobal([], "q", "claude-opus-4-8")).toEqual([]);
  });
});

describe("buildNotesBlock", () => {
  it("tags notes [N1].. and maps slugs", () => {
    const scored = [
      { note: note("wm", "워터마크", "본문1"), score: 3, hop: 0 },
      { note: note("cur", "커서", "본문2"), score: 1, hop: 1 },
    ];
    const { block, tagBySlug } = buildNotesBlock(scored);
    expect(block).toContain("[N1] 워터마크");
    expect(block).toContain("[N2] 커서");
    expect(tagBySlug.get("wm")).toBe("N1");
    expect(tagBySlug.get("cur")).toBe("N2");
  });
});
