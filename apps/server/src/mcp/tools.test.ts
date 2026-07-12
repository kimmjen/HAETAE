import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../db";
import { projectWiki, projectNotes } from "../db/schema";
import { callClaude } from "../services/memory/claude-cli";
import { recallNotes, recallGlobal, askBrain } from "./tools";

// Mock the one subprocess boundary so the tools are deterministic + offline.
vi.mock("../services/memory/claude-cli", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/memory/claude-cli")>();
  return { ...actual, callClaude: vi.fn() };
});

const NOTES = [
  { slug: "oauth", title: "OAuth 한도", content: "[[keychain]] 에서 토큰 읽어 한도 조회" },
  { slug: "keychain", title: "키체인", content: "security 명령으로 토큰" },
];

describe("mcp tools", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    db.insert(projectWiki).values({ projectPath: "/p", content: "wiki", model: "m", generatedAt: 1 }).run();
    vi.mocked(callClaude).mockReset();
  });
  afterEach(() => closeDb());

  const seedNotes = () =>
    db.insert(projectNotes)
      .values({ projectPath: "/p", content: JSON.stringify({ notes: NOTES }), model: "m", generatedAt: 1 })
      .run();

  describe("recallNotes", () => {
    it("returns the relevant note bodies the agent selected by meaning", async () => {
      seedNotes();
      vi.mocked(callClaude).mockResolvedValue('{"slugs": ["oauth"]}');
      const text = await recallNotes("/p", "인증은 어떻게?", "claude-opus-4-8", db);
      expect(text).toContain("OAuth 한도");
      expect(text).toContain("한도 조회");
      expect(text).toContain("[N1]"); // citable block
    });

    it("messages when no notes exist", async () => {
      const text = await recallNotes("/p", "q", "claude-opus-4-8", db);
      expect(text).toContain("원자 노트가 없습니다");
    });

    it("messages when nothing is relevant", async () => {
      seedNotes();
      vi.mocked(callClaude).mockResolvedValue('{"slugs": []}');
      expect(await recallNotes("/p", "무관", "claude-opus-4-8", db)).toContain("찾지 못했습니다");
    });
  });

  describe("recallGlobal", () => {
    it("recalls across projects, labeling each note with its project", async () => {
      seedNotes(); // project /p
      db.insert(projectNotes)
        .values({
          projectPath: "/other/Alpha",
          content: JSON.stringify({ notes: [{ slug: "grid", title: "계통 안정도", content: "주파수 응답" }] }),
          model: "m",
          generatedAt: 1,
        })
        .run();
      vi.mocked(callClaude).mockResolvedValue('{"slugs": ["Alpha/grid", "p/oauth"]}');
      const text = await recallGlobal("주파수?", "claude-opus-4-8", db);
      expect(text).toContain("(Alpha) 계통 안정도");
      expect(text).toContain("(p) OAuth 한도");
    });

    it("messages when no project has notes", async () => {
      expect(await recallGlobal("q", "claude-opus-4-8", db)).toContain("노트가 있는 프로젝트가 없습니다");
    });
  });

  describe("askBrain", () => {
    it("returns the grounded answer", async () => {
      seedNotes();
      // ask path: selection call (slugs) then the answer call.
      vi.mocked(callClaude).mockImplementation(async (prompt: string) =>
        prompt.includes("relevant to a QUESTION") || prompt.includes("relevant to answer")
          ? '{"slugs": ["oauth"]}'
          : "OAuth 토큰을 키체인에서 읽습니다 [N1].",
      );
      const text = await askBrain("/p", "인증?", "claude-opus-4-8", db);
      expect(text).toContain("키체인에서 읽습니다");
    });
  });
});
