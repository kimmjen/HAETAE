import { describe, expect, it } from "vitest";
import { formatUsd, formatUsdCompact, formatMoney, formatMoneyCompact } from "./currency";

describe("formatUsd", () => {
  it("formats two decimals", () => {
    expect(formatUsd(14.22)).toBe("$14.22");
  });

  it("renders zero with two decimals", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("groups thousands", () => {
    expect(formatUsd(1234567.89)).toBe("$1,234,567.89");
  });
});

describe("formatUsdCompact", () => {
  it("0 과 sub-cent 는 $0 으로 통일 (사인 노이즈 제거)", () => {
    expect(formatUsdCompact(0)).toBe("$0");
    expect(formatUsdCompact(0.001)).toBe("$0");
    expect(formatUsdCompact(-0.001)).toBe("$0");
  });

  it("0.01 이상 1 미만은 센트 노출", () => {
    expect(formatUsdCompact(0.05)).toBe("$0.05");
    expect(formatUsdCompact(0.99)).toBe("$0.99");
  });

  it("천 단위 미만은 풀 가격 (센트 보존)", () => {
    expect(formatUsdCompact(14.22)).toBe("$14.22");
    expect(formatUsdCompact(999.99)).toBe("$999.99");
  });

  it("천 단위부터 k/m/b 로 떨어짐", () => {
    expect(formatUsdCompact(1234.56)).toBe("$1.2k");
    expect(formatUsdCompact(1_234_567)).toBe("$1.2m");
    expect(formatUsdCompact(1_234_567_890)).toBe("$1.2b");
  });

  it("음수는 부호 보존", () => {
    expect(formatUsdCompact(-14.22)).toBe("-$14.22");
    expect(formatUsdCompact(-1234.56)).toBe("-$1.2k");
    expect(formatUsdCompact(-1_234_567)).toBe("-$1.2m");
  });

  it("0.005 ~ 0.01 사이는 truncation 신호 (`<$0.01`)", () => {
    expect(formatUsdCompact(0.0075)).toBe("<$0.01");
    expect(formatUsdCompact(-0.0075)).toBe("-<$0.01");
  });
});

// 비용은 USD 로 저장 → 표시 통화/환율을 인자로 받아 환산. USD 경로는 기존
// formatUsd* 와 동일해야 하고(회귀 방지), KRW 는 환산 후 원화 표기.
describe("formatMoney (full)", () => {
  it("USD 는 formatUsd 와 동일", () => {
    expect(formatMoney(14.22, "USD", 1380)).toBe("$14.22");
    expect(formatMoney(1234567.89, "USD", 1380)).toBe("$1,234,567.89");
  });

  it("KRW 는 환율 적용 후 소수점 없는 원화 (그룹핑)", () => {
    expect(formatMoney(1, "KRW", 1380)).toBe("₩1,380");
    expect(formatMoney(10, "KRW", 1380)).toBe("₩13,800");
    // 반올림 (KRW 는 소수점 없음)
    expect(formatMoney(1, "KRW", 1380.7)).toBe("₩1,381");
  });
});

describe("formatMoneyCompact", () => {
  it("USD 는 formatUsdCompact 와 동일", () => {
    expect(formatMoneyCompact(0, "USD", 1380)).toBe("$0");
    expect(formatMoneyCompact(14.22, "USD", 1380)).toBe("$14.22");
    expect(formatMoneyCompact(1234.56, "USD", 1380)).toBe("$1.2k");
  });

  it("KRW 천 단위 미만은 정수 원화", () => {
    expect(formatMoneyCompact(0.5, "KRW", 1380)).toBe("₩690"); // 0.5*1380
    expect(formatMoneyCompact(0.1, "KRW", 1380)).toBe("₩138");
  });

  it("KRW 천 단위부터 k/m/b", () => {
    expect(formatMoneyCompact(1, "KRW", 1380)).toBe("₩1.4k"); // 1380
    expect(formatMoneyCompact(1000, "KRW", 1380)).toBe("₩1.4m"); // 1.38M
    expect(formatMoneyCompact(1_000_000, "KRW", 1380)).toBe("₩1.4b"); // 1.38B
  });

  it("KRW 미세 금액은 ₩0 / <₩1 로 노이즈 제거", () => {
    expect(formatMoneyCompact(0.0005, "KRW", 1380)).toBe("<₩1"); // 0.69 (0.5~1)
    expect(formatMoneyCompact(0.0001, "KRW", 1380)).toBe("₩0"); // 0.138 (<0.5)
  });

  it("KRW 음수 부호 보존", () => {
    expect(formatMoneyCompact(-1, "KRW", 1380)).toBe("-₩1.4k");
    expect(formatMoneyCompact(-0.0005, "KRW", 1380)).toBe("-<₩1");
  });
});
