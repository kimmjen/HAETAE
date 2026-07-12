import { describe, expect, it } from "vitest";
import { parseFxSeries } from "./useFxHistory";

describe("parseFxSeries", () => {
  const sample = {
    amount: 1,
    base: "USD",
    start_date: "2026-05-02",
    end_date: "2026-05-06",
    rates: {
      "2026-05-06": { KRW: 1517.15 },
      "2026-05-02": { KRW: 1510.2 },
      "2026-05-05": { KRW: 1512.0 },
    },
  };

  it("frankfurter 시계열을 날짜 오름차순 {date,rate} 배열로", () => {
    const out = parseFxSeries(sample);
    expect(out).toEqual([
      { date: "2026-05-02", rate: 1510.2 },
      { date: "2026-05-05", rate: 1512.0 },
      { date: "2026-05-06", rate: 1517.15 },
    ]);
  });

  it("rates 없거나 형식 이상이면 빈 배열", () => {
    expect(parseFxSeries(null)).toEqual([]);
    expect(parseFxSeries({})).toEqual([]);
    expect(parseFxSeries([])).toEqual([]);
    expect(parseFxSeries({ rates: "nope" })).toEqual([]);
  });

  it("KRW 누락·비수치 항목은 제외", () => {
    const out = parseFxSeries({
      rates: {
        "2026-05-02": { KRW: 1500 },
        "2026-05-03": { EUR: 0.9 },
        "2026-05-04": { KRW: "x" },
      },
    });
    expect(out).toEqual([{ date: "2026-05-02", rate: 1500 }]);
  });
});
