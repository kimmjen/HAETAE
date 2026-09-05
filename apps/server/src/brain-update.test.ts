import { describe, expect, it } from "vitest";
import { shouldFold, resolveProjectRoot } from "./brain-update";

const NOW = 1_800_000_000_000;
const MIN = 60_000;

describe("shouldFold", () => {
  it("충분한 새 메시지 + 쿨다운 지남 → fold", () => {
    expect(shouldFold({ pending: 35, wikiExists: true, wikiGeneratedAt: NOW - 30 * MIN, now: NOW }).run).toBe(true);
  });

  it("새 메시지 부족 → skip", () => {
    const r = shouldFold({ pending: 3, wikiExists: true, wikiGeneratedAt: NOW - 30 * MIN, now: NOW });
    expect(r.run).toBe(false);
    expect(r.reason).toMatch(/3 new msgs/);
  });

  it("쿨다운 이내 → skip (메시지 충분해도)", () => {
    const r = shouldFold({ pending: 50, wikiExists: true, wikiGeneratedAt: NOW - 5 * MIN, now: NOW });
    expect(r.run).toBe(false);
    expect(r.reason).toMatch(/cooldown/);
  });

  it("위키 없음(첫 빌드) + 충분 → fold, 쿨다운 무관", () => {
    expect(shouldFold({ pending: 40, wikiExists: false, wikiGeneratedAt: null, now: NOW }).run).toBe(true);
  });

  it("위키 없음 + 부족 → skip", () => {
    expect(shouldFold({ pending: 2, wikiExists: false, wikiGeneratedAt: null, now: NOW }).run).toBe(false);
  });

  it("임계값·쿨다운은 인자로 재정의 가능", () => {
    expect(shouldFold({ pending: 4, wikiExists: false, wikiGeneratedAt: null, now: NOW, minDelta: 3 }).run).toBe(true);
    expect(shouldFold({ pending: 35, wikiExists: true, wikiGeneratedAt: NOW - 8 * MIN, now: NOW, cooldownMs: 5 * MIN }).run).toBe(true);
  });
});

describe("resolveProjectRoot", () => {
  const roots = ["/Users/x/GitHub/HAETAE", "/Users/x/GitHub/KPG", "/Users/x/GitHub/KPG-advance"];

  it("정확히 일치하는 루트", () => {
    expect(resolveProjectRoot("/Users/x/GitHub/HAETAE", roots)).toBe("/Users/x/GitHub/HAETAE");
  });

  it("서브디렉터리에서 실행 → 포함하는 루트", () => {
    expect(resolveProjectRoot("/Users/x/GitHub/HAETAE/apps/server", roots)).toBe("/Users/x/GitHub/HAETAE");
  });

  it("접두사가 겹치는 형제 루트는 오매칭 안 함 (KPG vs KPG-advance)", () => {
    // KPG-advance 하위는 KPG-advance로만 매칭, KPG로 새지 않음
    expect(resolveProjectRoot("/Users/x/GitHub/KPG-advance/src", roots)).toBe("/Users/x/GitHub/KPG-advance");
    // KPG 하위는 KPG로만
    expect(resolveProjectRoot("/Users/x/GitHub/KPG/lib", roots)).toBe("/Users/x/GitHub/KPG");
  });

  it("어느 루트에도 속하지 않으면 null", () => {
    expect(resolveProjectRoot("/Users/x/GitHub/OTHER", roots)).toBeNull();
    expect(resolveProjectRoot("/tmp", roots)).toBeNull();
  });
});
