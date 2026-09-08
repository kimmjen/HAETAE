import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import {
  projectWiki,
  projectNotes,
  projectOntology,
  projectEval,
  projectLinks,
  projectTopics,
} from "../../db/schema";
import { callClaude } from "./claude-cli";
import { getNotes } from "./notes";
import { getOntology } from "./ontology";
import { getEval } from "./eval";
import { selectStaleDerived, cascadeStaleDerived } from "./cascade";

// callClaude is the only subprocess boundary — mock it so the cascade runs the
// real generators (and the real staleness recompute) against an in-memory DB
// without spawning `claude --print`. One payload satisfies every layer's parser.
vi.mock("./claude-cli", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./claude-cli")>();
  return { ...actual, callClaude: vi.fn() };
});

const PAYLOAD = JSON.stringify({
  notes: [
    { slug: "a", title: "A", content: "body [[b]]" },
    { slug: "b", title: "B", content: "b" },
  ],
  concepts: [{ id: "c1", label: "C1", kind: "decision" }],
  relations: [],
  // getLinks / getTopics read these keys off the stored row unguarded, so a
  // payload missing them throws on read rather than returning null.
  links: [],
  topics: [],
  score: 80,
  summary: "ok",
  issues: [],
});

describe("cascade — auto-regenerate stale derived layers", () => {
  let db: Db;

  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    vi.mocked(callClaude).mockReset();
    vi.mocked(callClaude).mockResolvedValue(PAYLOAD);
  });
  afterEach(() => closeDb());

  const insertWiki = (generatedAt: number) =>
    db
      .insert(projectWiki)
      .values({ projectPath: "/p", content: "w", model: "claude-opus-4-7", generatedAt })
      .run();
  const insertNotes = (generatedAt: number) =>
    db
      .insert(projectNotes)
      .values({ projectPath: "/p", content: PAYLOAD, model: "claude-opus-4-7", generatedAt })
      .run();
  const insertOntology = (generatedAt: number) =>
    db
      .insert(projectOntology)
      .values({ projectPath: "/p", content: PAYLOAD, model: "claude-opus-4-7", generatedAt })
      .run();
  const insertEval = (generatedAt: number) =>
    db
      .insert(projectEval)
      .values({ projectPath: "/p", content: PAYLOAD, score: 50, model: "claude-opus-4-7", generatedAt })
      .run();
  const insertLinks = (generatedAt: number) =>
    db
      .insert(projectLinks)
      .values({ projectPath: "/p", content: PAYLOAD, model: "claude-opus-4-7", generatedAt })
      .run();
  const insertTopics = (generatedAt: number) =>
    db
      .insert(projectTopics)
      .values({ projectPath: "/p", content: PAYLOAD, model: "claude-opus-4-7", generatedAt })
      .run();

  describe("selectStaleDerived", () => {
    it("위키보다 오래됐고 이미 존재하는 레이어만 고른다", () => {
      insertWiki(2000);
      insertNotes(1000); // stale
      insertOntology(3000); // 위키보다 최신 → not stale
      // eval 없음 → 부트스트랩 대상 아님
      expect(selectStaleDerived("/p", db)).toEqual(["notes"]);
    });

    it("파생물이 없으면 빈 배열 — 부트스트랩하지 않는다", () => {
      insertWiki(2000);
      expect(selectStaleDerived("/p", db)).toEqual([]);
    });

    it("links·topics 도 낡으면 고른다 — UI가 배지를 띄우는 레이어 전부", () => {
      insertWiki(2000);
      insertNotes(1000);
      insertOntology(1000);
      insertLinks(1000);
      insertTopics(1000);
      insertEval(1000);
      // links 는 notes·ontology 를 읽으므로 그 뒤, eval 은 감사라 맨 끝.
      expect(selectStaleDerived("/p", db)).toEqual([
        "notes",
        "ontology",
        "links",
        "topics",
        "eval",
      ]);
    });
  });

  describe("cascadeStaleDerived", () => {
    it("낡은 레이어를 재생성해 stale 을 해소한다 (없는 레이어는 건너뜀)", async () => {
      insertWiki(2000);
      insertNotes(1000);
      insertOntology(1000);
      // eval 없음

      const refreshed = await cascadeStaleDerived("/p", "opus", db);

      expect(refreshed).toEqual(["notes", "ontology"]);
      expect(getNotes("/p", db)!.isStale).toBe(false);
      expect(getOntology("/p", db)!.isStale).toBe(false);
      expect(getEval("/p", db)).toBeNull(); // 몰래 만들지 않음
    });

    it("한 레이어가 실패해도 나머지는 재생성된다", async () => {
      insertWiki(2000);
      insertNotes(1000);
      insertOntology(1000);
      insertEval(1000);

      vi.mocked(callClaude).mockImplementation(async (prompt: string) => {
        if (prompt.includes("TYPED knowledge ontology")) throw new Error("boom");
        return PAYLOAD;
      });

      const refreshed = await cascadeStaleDerived("/p", "opus", db);

      expect(refreshed).toEqual(["notes", "eval"]);
      expect(getOntology("/p", db)!.isStale).toBe(true); // 실패 → 여전히 낡음
      expect(getNotes("/p", db)!.isStale).toBe(false);
      expect(getEval("/p", db)!.isStale).toBe(false);
    });
  });
});
