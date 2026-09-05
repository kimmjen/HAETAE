import { describe, expect, it } from "vitest";
import {
  buildPlanPrompt,
  buildPagePrompt,
  parsePlan,
  mergeTopics,
  MAX_TOPICS_PER_RUN,
  MAX_TOPICS_TOTAL,
  type TopicPage,
} from "./topics";
import type { BrainSource } from "./ask";

const page = (slug: string, content = "c", generatedAt = 0): TopicPage => ({
  slug,
  title: slug.toUpperCase(),
  content,
  generatedAt,
});

describe("parsePlan", () => {
  it("유효한 토픽만 통과, slug 중복은 첫 항목 승리", () => {
    const raw = JSON.stringify({
      topics: [
        { slug: "fts", title: "FTS 검색", query: "fts5 trigram 검색" },
        { slug: "fts", title: "중복", query: "dup" },
        { slug: "", title: "빈 slug", query: "q" },
        { slug: "no-query", title: "쿼리 없음" },
      ],
    });
    const plan = parsePlan(raw);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({ slug: "fts", title: "FTS 검색", query: "fts5 trigram 검색" });
  });

  it("MAX_TOPICS_PER_RUN 초과는 잘린다", () => {
    const raw = JSON.stringify({
      topics: Array.from({ length: 6 }, (_, i) => ({ slug: `t${i}`, title: `T${i}`, query: "q" })),
    });
    expect(parsePlan(raw)).toHaveLength(MAX_TOPICS_PER_RUN);
  });

  it("총량 캡 도달 시 신규 slug는 버리고 기존 slug 업데이트만 허용", () => {
    const existing = Array.from({ length: MAX_TOPICS_TOTAL }, (_, i) => `e${i}`);
    const raw = JSON.stringify({
      topics: [
        { slug: "brand-new", title: "신규", query: "q" },
        { slug: "e3", title: "기존 갱신", query: "q" },
      ],
    });
    const plan = parsePlan(raw, existing);
    expect(plan.map((t) => t.slug)).toEqual(["e3"]);
  });

  it("펜스로 감싼 JSON도 파싱한다", () => {
    const raw = '```json\n{"topics":[{"slug":"a","title":"A","query":"q"}]}\n```';
    expect(parsePlan(raw)).toHaveLength(1);
  });
});

describe("mergeTopics", () => {
  it("갱신된 slug는 제자리 교체, 신규는 뒤에 추가, 나머지는 그대로", () => {
    const existing = [page("a", "old-a"), page("b", "old-b"), page("c", "old-c")];
    const updates = [page("b", "new-b", 99), page("d", "new-d", 99)];
    const merged = mergeTopics(existing, updates);
    expect(merged.map((t) => t.slug)).toEqual(["a", "b", "c", "d"]);
    expect(merged[1].content).toBe("new-b");
    expect(merged[0].content).toBe("old-a");
  });

  it("빈 업데이트는 기존을 그대로 반환", () => {
    const existing = [page("a")];
    expect(mergeTopics(existing, [])).toEqual(existing);
  });
});

describe("buildPlanPrompt", () => {
  it("기존 페이지 인덱스와 slug 재사용 규칙을 포함한다", () => {
    const p = buildPlanPrompt("proj", "# wiki", [{ slug: "fts", title: "FTS" }]);
    expect(p).toContain("- fts: FTS");
    expect(p).toMatch(/reuse the SAME slug/i);
  });

  it("총량 캡 도달 시 업데이트 전용 지시가 추가된다", () => {
    const existing = Array.from({ length: MAX_TOPICS_TOTAL }, (_, i) => ({
      slug: `e${i}`,
      title: `E${i}`,
    }));
    expect(buildPlanPrompt("proj", "# wiki", existing)).toMatch(/ONLY update existing slugs/i);
    expect(buildPlanPrompt("proj", "# wiki", [])).not.toMatch(/ONLY update existing slugs/i);
  });
});

describe("buildPagePrompt", () => {
  const topic = { slug: "fts", title: "FTS 검색", query: "fts5" };
  const sources: BrainSource[] = [
    { tag: "S1", sessionId: "s1", ts: 0, snippet: "trigram 마이그레이션 0020" },
  ];

  it("발췌를 태그와 함께 싣고 디테일 규칙을 포함한다", () => {
    const p = buildPagePrompt("proj", topic, "# wiki", null, sources);
    expect(p).toContain("[S1]");
    expect(p).toContain("trigram 마이그레이션 0020");
    expect(p).toMatch(/issue\/PR numbers/i);
    expect(p).toContain("# FTS 검색");
  });

  it("기존 페이지가 있으면 업데이트 프레이밍으로 포함한다", () => {
    const p = buildPagePrompt("proj", topic, "# wiki", "# FTS 검색\n기존 본문", sources);
    expect(p).toContain("CURRENT PAGE");
    expect(p).toContain("기존 본문");
  });

  it("발췌가 없으면 위키 전용 안내로 대체", () => {
    const p = buildPagePrompt("proj", topic, "# wiki", null, []);
    expect(p).toContain("관련 대화 발췌 없음");
  });
});
