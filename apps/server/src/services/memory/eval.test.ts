import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { projectWiki } from "../../db/schema";
import { callClaude } from "./claude-cli";
import { parseEval, buildPrompt, evalCorrectionHints, generateEval, getEvalHistory, type EvalReport } from "./eval";

vi.mock("./claude-cli", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./claude-cli")>();
  return { ...actual, callClaude: vi.fn() };
});

const report = (issues: EvalReport["issues"]): EvalReport => ({ score: 50, summary: "", issues });

describe("parseEval", () => {
  it("parses score/summary/issues from fenced JSON", () => {
    const raw = "```json\n" + JSON.stringify({
      score: 82,
      summary: "대체로 정확",
      issues: [
        { type: "staleness", severity: "medium", detail: "최근 X 미반영", fix: "갱신" },
        { type: "accuracy", severity: "high", detail: "Y 근거 없음", fix: "삭제" },
      ],
    }) + "\n```";
    const r = parseEval(raw);
    expect(r.score).toBe(82);
    expect(r.issues).toHaveLength(2);
    expect(r.issues[0].type).toBe("staleness");
  });

  it("clamps score to 0–100 and rounds", () => {
    expect(parseEval(JSON.stringify({ score: 150, issues: [] })).score).toBe(100);
    expect(parseEval(JSON.stringify({ score: -5, issues: [] })).score).toBe(0);
    expect(parseEval(JSON.stringify({ score: 77.6, issues: [] })).score).toBe(78);
  });

  it("drops issues with invalid type or severity, caps at 5", () => {
    const issues = [
      { type: "bogus", severity: "high", detail: "x", fix: "y" },
      { type: "gap", severity: "huge", detail: "x", fix: "y" },
      ...Array.from({ length: 7 }, () => ({ type: "vibe", severity: "low", detail: "d", fix: "f" })),
    ];
    const r = parseEval(JSON.stringify({ score: 50, issues }));
    expect(r.issues.length).toBe(5); // 2 invalid dropped, 7 valid capped to 5
    expect(r.issues.every((i) => i.type === "vibe")).toBe(true);
  });

  it("tolerates missing fields", () => {
    const r = parseEval("{}");
    expect(r.score).toBe(0);
    expect(r.issues).toEqual([]);
  });
});

describe("buildPrompt", () => {
  it("includes wiki, sample, voice and asks for JSON score/issues", () => {
    const p = buildPrompt("WIKI", "SAMPLE", "VOICE");
    expect(p).toContain("WIKI");
    expect(p).toContain("SAMPLE");
    expect(p).toContain("VOICE");
    expect(p).toMatch(/score/);
    expect(p).toMatch(/accuracy|staleness|gap|vibe/);
  });
  it("notes when there is no voice profile", () => {
    expect(buildPrompt("w", "s", null)).toContain("프로필 없음");
  });
});

describe("evalCorrectionHints", () => {
  it("formats actionable issues with type, severity, detail and fix", () => {
    const hints = evalCorrectionHints(
      report([{ type: "accuracy", severity: "high", detail: "Y 근거 없음", fix: "삭제" }]),
    );
    expect(hints).toContain("[accuracy/high]");
    expect(hints).toContain("Y 근거 없음");
    expect(hints).toContain("삭제");
  });

  it("drops subjective vibe issues and low severity (concrete edits only)", () => {
    const hints = evalCorrectionHints(
      report([
        { type: "vibe", severity: "high", detail: "톤 안 맞음", fix: "f" },
        { type: "gap", severity: "low", detail: "사소", fix: "f" },
        { type: "gap", severity: "medium", detail: "중요 누락", fix: "보강" },
      ]),
    );
    expect(hints).toContain("중요 누락");
    expect(hints).not.toContain("톤 안 맞음");
    expect(hints).not.toContain("사소");
  });

  it("caps at max and returns empty string when nothing qualifies", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      type: "gap" as const, severity: "high" as const, detail: `g${i}`, fix: "f",
    }));
    expect(evalCorrectionHints(report(many), 6).split("\n")).toHaveLength(6);
    expect(evalCorrectionHints(report([{ type: "vibe", severity: "low", detail: "x", fix: "" }]))).toBe("");
    expect(evalCorrectionHints(report([]))).toBe("");
  });
});

describe("eval score history", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    db.insert(projectWiki)
      .values({ projectPath: "/p", content: "wiki", model: "m", generatedAt: 1000 })
      .run();
    vi.mocked(callClaude).mockReset();
  });
  afterEach(() => closeDb());

  it("appends one history point per eval run, oldest→newest", async () => {
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify({ score: 60, summary: "", issues: [] }));
    await generateEval("/p", "claude-opus-4-8", db);
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify({ score: 85, summary: "", issues: [] }));
    await generateEval("/p", "claude-opus-4-8", db);

    const hist = getEvalHistory("/p", db);
    expect(hist.map((h) => h.score)).toEqual([60, 85]); // chart order
    expect(hist[0].generatedAt).toBeLessThanOrEqual(hist[1].generatedAt);
  });

  it("returns empty for a project with no evals", () => {
    expect(getEvalHistory("/other", db)).toEqual([]);
  });
});
