import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import {
  extractTitle,
  extractText,
  buildSourcesBlock,
  addExternalSource,
  listExternalSources,
  removeExternalSource,
} from "./external-sources";

describe("extractTitle / extractText (pure)", () => {
  it("title 태그를 뽑고 엔티티를 디코드한다", () => {
    expect(extractTitle("<html><title>A &amp; B</title></html>")).toBe("A & B");
    expect(extractTitle("<p>no title</p>")).toBeNull();
  });

  it("script/style을 버리고 블록 경계를 줄바꿈으로 살린다", () => {
    const html = `<html><head><style>.x{}</style></head><body>
      <script>alert(1)</script>
      <h1>제목</h1><p>첫 문단 &amp; 내용</p><p>둘째</p></body></html>`;
    const text = extractText(html);
    expect(text).not.toContain("alert");
    expect(text).not.toContain(".x{}");
    expect(text).toContain("제목");
    expect(text).toContain("첫 문단 & 내용");
    expect(text.indexOf("제목")).toBeLessThan(text.indexOf("둘째"));
  });

  it("cap을 넘으면 자른다", () => {
    expect(extractText(`<p>${"x".repeat(500)}</p>`, 100).length).toBe(100);
  });
});

describe("buildSourcesBlock (pure)", () => {
  const src = (i: number, len = 50) => ({
    url: `https://ex.com/${i}`,
    title: `문서 ${i}`,
    content: "c".repeat(len),
  });

  it("빈 목록은 빈 문자열", () => {
    expect(buildSourcesBlock([])).toBe("");
  });

  it("[E1]/[E2] 태그와 제목·URL을 싣는다", () => {
    const block = buildSourcesBlock([src(1), src(2)]);
    expect(block).toContain("[E1] 문서 1 (https://ex.com/1)");
    expect(block).toContain("[E2]");
  });

  it("예산 초과 소스는 버리되 첫 소스는 잘라서라도 포함", () => {
    const block = buildSourcesBlock([src(1, 300), src(2, 300)], 400);
    expect(block).toContain("[E1]");
    expect(block).not.toContain("[E2]");
    const only = buildSourcesBlock([src(1, 900)], 400);
    expect(only).toContain("…(truncated)");
    expect(only.length).toBeLessThan(500);
  });
});

describe("add/list/remove ExternalSource", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html><title>독스</title><body><p>본문 내용</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    closeDb();
  });

  it("fetch → 추출 → 저장, 같은 URL 재추가는 교체(업서트)", async () => {
    const row = await addExternalSource("/p", "https://ex.com/doc", db);
    expect(row.title).toBe("독스");
    expect(row.content).toContain("본문 내용");
    await addExternalSource("/p", "https://ex.com/doc", db);
    expect(listExternalSources("/p", db)).toHaveLength(1);
  });

  it("http/https 외 프로토콜은 거부", async () => {
    await expect(addExternalSource("/p", "file:///etc/passwd", db)).rejects.toThrow(/http/);
  });

  it("HTTP 에러는 저장 없이 실패", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(addExternalSource("/p", "https://ex.com/404", db)).rejects.toThrow(/404/);
    expect(listExternalSources("/p", db)).toHaveLength(0);
  });

  it("remove는 프로젝트 스코프를 지킨다", async () => {
    const row = await addExternalSource("/p", "https://ex.com/doc", db);
    expect(removeExternalSource("/other", row.id, db)).toBe(false);
    expect(removeExternalSource("/p", row.id, db)).toBe(true);
    expect(listExternalSources("/p", db)).toHaveLength(0);
  });
});
