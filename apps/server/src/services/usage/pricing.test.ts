import { describe, expect, it } from "vitest";
import { PRICING, calculateCost, modelFamily } from "./pricing";

describe("pricing.modelFamily", () => {
  it("recognises Opus / Sonnet / Haiku regardless of version suffix", () => {
    expect(modelFamily("claude-opus-4-7")).toBe("opus");
    expect(modelFamily("claude-opus-5-1-20991231")).toBe("opus");
    expect(modelFamily("claude-sonnet-4-6")).toBe("sonnet");
    expect(modelFamily("claude-haiku-4-5-20251001")).toBe("haiku");
  });

  it("falls back to 'unknown' for unrecognised model ids", () => {
    expect(modelFamily("claude-future-9")).toBe("unknown");
    expect(modelFamily("")).toBe("unknown");
  });
});

describe("pricing.PRICING", () => {
  // Lock the public 2026-06-06 numbers so an accidental edit fails CI —
  // intentional updates require touching this test alongside the table.
  it("opus rates", () => {
    expect(PRICING.opus).toEqual({ input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 });
  });
  it("sonnet rates", () => {
    expect(PRICING.sonnet).toEqual({ input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 });
  });
  it("haiku rates", () => {
    expect(PRICING.haiku).toEqual({ input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 });
  });
  it("unknown is all zero (so an unrecognised model never fabricates cost)", () => {
    expect(PRICING.unknown).toEqual({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
  });
});

describe("pricing.calculateCost", () => {
  it("sums all four token streams at the family rate, scaled per-Mtok", () => {
    // Opus, 1M input + 1M output → 5 + 25 = 30
    expect(
      calculateCost("claude-opus-4-7", {
        input: 1_000_000,
        output: 1_000_000,
        cacheCreation: 0,
        cacheRead: 0,
      }),
    ).toBeCloseTo(30, 6);
  });

  it("includes cache write and cache read separately", () => {
    // Sonnet: 1M cache write + 1M cache read → 3.75 + 0.30 = 4.05
    expect(
      calculateCost("claude-sonnet-4-6", {
        input: 0,
        output: 0,
        cacheCreation: 1_000_000,
        cacheRead: 1_000_000,
      }),
    ).toBeCloseTo(4.05, 6);
  });

  it("returns 0 for unknown model ids", () => {
    expect(
      calculateCost("claude-future", {
        input: 1_000_000,
        output: 1_000_000,
        cacheCreation: 1_000_000,
        cacheRead: 1_000_000,
      }),
    ).toBe(0);
  });

  it("scales correctly for small token counts (no precision drift)", () => {
    // Haiku: 1k output → 5 * 1000 / 1e6 = 0.005
    expect(
      calculateCost("claude-haiku-4-5", {
        input: 0,
        output: 1000,
        cacheCreation: 0,
        cacheRead: 0,
      }),
    ).toBeCloseTo(0.005, 9);
  });
});
