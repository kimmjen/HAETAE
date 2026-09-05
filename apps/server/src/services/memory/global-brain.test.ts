import { describe, expect, it } from "vitest";
import {
  digestProjectWikis,
  buildGlobalWikiPrompt,
  buildGlobalPlanPrompt,
  buildGlobalPagePrompt,
  buildGlobalEvalPrompt,
  type ProjectWikiLite,
} from "./global-brain";
import { MAX_TOPICS_TOTAL } from "./topics";

const wiki = (name: string, content = "본문", summary: string | null = "요약", generatedAt = 0): ProjectWikiLite => ({
  projectPath: `/Users/x/${name}`,
  content,
  summary,
  generatedAt,
});

describe("digestProjectWikis", () => {
  it("예산 내면 모든 프로젝트가 상세 블록 + 인덱스에 들어간다", () => {
    const d = digestProjectWikis([wiki("alpha"), wiki("beta")]);
    expect(d.covered).toBe(2);
    expect(d.total).toBe(2);
    expect(d.sourceBlock).toContain("## [alpha]");
    expect(d.sourceBlock).toContain("## [beta]");
    expect(d.indexBlock).toContain("- alpha: 요약");
    expect(d.indexBlock).toContain("- beta: 요약");
  });

  it("프로젝트 위키 본문은 cap에서 잘리고 truncated 마커가 붙는다", () => {
    const d = digestProjectWikis([wiki("alpha", "x".repeat(100))], 10_000, 20);
    expect(d.sourceBlock).toContain("…(truncated)");
    expect(d.sourceBlock).toContain("x".repeat(20));
    expect(d.sourceBlock).not.toContain("x".repeat(21));
  });

  it("예산을 넘겨도 최소 1개는 상세 블록에 포함, 인덱스는 전부 커버", () => {
    const d = digestProjectWikis([wiki("a"), wiki("b"), wiki("c")], 1);
    expect(d.covered).toBe(1);
    expect(d.total).toBe(3);
    expect(d.indexBlock.split("\n")).toHaveLength(3);
  });

  it("요약이 없으면 인덱스에 (요약 없음) 대체", () => {
    const d = digestProjectWikis([wiki("a", "본문", null)]);
    expect(d.indexBlock).toContain("- a: (요약 없음)");
  });
});

describe("buildGlobalWikiPrompt", () => {
  const digest = digestProjectWikis([wiki("alpha"), wiki("beta")]);

  it("고정 섹션 구조와 인덱스를 포함한다", () => {
    const p = buildGlobalWikiPrompt(digest, "");
    expect(p).toContain("## 프로젝트 지도 / Project Map");
    expect(p).toContain("## 교차 주제 / Cross-Cutting Themes");
    expect(p).toContain("- alpha: 요약");
    expect(p).not.toContain("CURRENT GLOBAL BRAIN");
  });

  it("기존 글로벌 위키가 있으면 reconcile 프레이밍으로 싣는다", () => {
    const p = buildGlobalWikiPrompt(digest, "# 기존 글로벌");
    expect(p).toContain("CURRENT GLOBAL BRAIN");
    expect(p).toContain("# 기존 글로벌");
  });

  it("일부만 상세 커버되면 커버리지 주석이 붙는다", () => {
    const partial = digestProjectWikis([wiki("a"), wiki("b"), wiki("c")], 1);
    expect(buildGlobalWikiPrompt(partial, "")).toContain("1/3");
  });
});

describe("buildGlobalPlanPrompt", () => {
  it("교차 프로젝트(2개 이상) 제약과 기존 slug 재사용 규칙을 포함한다", () => {
    const p = buildGlobalPlanPrompt("# 글로벌", [{ slug: "auth", title: "인증" }]);
    expect(p).toMatch(/span 2\+ projects/i);
    expect(p).toContain("- auth: 인증");
    expect(p).toMatch(/reuse the SAME slug/i);
  });

  it("총량 캡 도달 시 업데이트 전용 지시가 추가된다", () => {
    const existing = Array.from({ length: MAX_TOPICS_TOTAL }, (_, i) => ({ slug: `e${i}`, title: `E${i}` }));
    expect(buildGlobalPlanPrompt("# 글로벌", existing)).toMatch(/ONLY update existing slugs/i);
    expect(buildGlobalPlanPrompt("# 글로벌", [])).not.toMatch(/ONLY update existing slugs/i);
  });
});

describe("buildGlobalPagePrompt", () => {
  const topic = { slug: "auth", title: "인증 아키텍처", query: "auth oauth" };

  it("제목으로 시작하고 프로젝트 위키를 증거로 싣는다", () => {
    const p = buildGlobalPagePrompt(topic, "# 글로벌", null, "## [alpha]\n인증 코드");
    expect(p).toContain("# 인증 아키텍처");
    expect(p).toContain("## [alpha]");
    expect(p).toContain("인증 코드");
    expect(p).toMatch(/CROSS-PROJECT/);
  });

  it("기존 페이지가 있으면 업데이트 프레이밍으로 포함한다", () => {
    const p = buildGlobalPagePrompt(topic, "# 글로벌", "# 인증 아키텍처\n기존 본문", "## [a]\n증거");
    expect(p).toContain("CURRENT PAGE");
    expect(p).toContain("기존 본문");
  });
});

describe("buildGlobalEvalPrompt", () => {
  it("프로젝트 인덱스를 ground truth로 싣고 voice 없으면 대체", () => {
    const p = buildGlobalEvalPrompt("# 글로벌", "- alpha: 요약", null);
    expect(p).toContain("- alpha: 요약");
    expect(p).toContain("(프로필 없음)");
    expect(p).toMatch(/Output ONLY JSON/i);
  });
});
