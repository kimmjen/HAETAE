import { describe, expect, it } from "vitest";
import { formatTokens, formatTokensCompact } from "./tokens";

describe("formatTokens", () => {
  it("groups thousands with commas", () => {
    expect(formatTokens(1_234_567)).toBe("1,234,567");
  });

  it("returns 0 for zero", () => {
    expect(formatTokens(0)).toBe("0");
  });

  it("does not split small numbers", () => {
    expect(formatTokens(42)).toBe("42");
  });
});

describe("formatTokensCompact", () => {
  it("compacts millions with lowercase suffix", () => {
    expect(formatTokensCompact(1_234_567)).toBe("1.2m");
  });

  it("compacts thousands with lowercase suffix", () => {
    expect(formatTokensCompact(14_200)).toBe("14.2k");
  });

  it("does not pad small values", () => {
    expect(formatTokensCompact(42)).toBe("42");
  });
});
