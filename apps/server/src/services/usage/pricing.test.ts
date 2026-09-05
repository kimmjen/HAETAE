import { describe, expect, it } from "vitest";
import { PRICING, calculateCost, modelFamily } from "./pricing";

describe("pricing.modelFamily", () => {
  it("recognises Opus / Sonnet / Haiku regardless of version suffix", () => {
    expect(modelFamily("claude-opus-4-7")).toBe("opus");
    expect(modelFamily("claude-opus-5-1-20991231")).toBe("opus");
    expect(modelFamily("claude-sonnet-4-6")).toBe("sonnet");
    expect(modelFamily("claude-haiku-4-5-20251001")).toBe("haiku");
  });

  it("splits Sonnet 5 from earlier Sonnets — they bill at different rates", () => {
    expect(modelFamily("claude-sonnet-5")).toBe("sonnet-5");
    expect(modelFamily("claude-sonnet-5-20260101")).toBe("sonnet-5");
  });

  it("does not mistake Sonnet 4.5 for Sonnet 5", () => {
    // "sonnet-4-5" ends in a 5 too; the tier probe must anchor on the major.
    expect(modelFamily("claude-sonnet-4-5")).toBe("sonnet");
  });

  it("prices Fable / Mythos rather than leaving them at zero", () => {
    expect(modelFamily("claude-fable-5")).toBe("fable");
    expect(modelFamily("claude-mythos-5")).toBe("fable");
  });

  it("splits Fable/Mythos 5.1 — it reads cache at 0.025x, not 0.1x", () => {
    expect(modelFamily("claude-fable-5-1")).toBe("fable-5-1");
    expect(modelFamily("claude-mythos-5-1")).toBe("fable-5-1");
  });

  it("falls back to 'unknown' for unrecognised model ids", () => {
    expect(modelFamily("claude-future-9")).toBe("unknown");
    expect(modelFamily("")).toBe("unknown");
  });
});

describe("pricing.PRICING", () => {
  // Lock the public 2026-09-06 numbers so an accidental edit fails the suite —
  // intentional updates require touching this test alongside the table.
  it("opus rates", () => {
    expect(PRICING.opus).toEqual({ input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 });
  });
  it("sonnet rates (4.x)", () => {
    expect(PRICING.sonnet).toEqual({ input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 });
  });
  it("sonnet 5 rates — cheaper than 4.x, not the same", () => {
    expect(PRICING["sonnet-5"]).toEqual({ input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 });
  });
  it("fable rates", () => {
    expect(PRICING.fable).toEqual({ input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 });
  });
  it("fable 5.1 rates — same but a quarter the cache read", () => {
    expect(PRICING["fable-5-1"]).toEqual({ input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 });
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

  it("bills Sonnet 5 at its own rate, not the 4.x one", () => {
    // 1M in + 1M out → 2 + 10 = 12, where the 4.x rate would say 18.
    expect(
      calculateCost("claude-sonnet-5", {
        input: 1_000_000,
        output: 1_000_000,
        cacheCreation: 0,
        cacheRead: 0,
      }),
    ).toBeCloseTo(12, 6);
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
