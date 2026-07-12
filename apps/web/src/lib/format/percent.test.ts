import { describe, expect, it } from "vitest";
import { formatPercent } from "./percent";

describe("formatPercent", () => {
  it("formats ratio as percent with one decimal", () => {
    expect(formatPercent(0.042)).toBe("4.2%");
  });

  it("rounds to one decimal", () => {
    expect(formatPercent(0.12345)).toBe("12.3%");
  });

  it("renders zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });
});
