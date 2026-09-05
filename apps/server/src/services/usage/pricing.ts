/**
 * Anthropic public pricing for Claude Code traffic. Per 1M tokens, USD.
 *
 * Updated 2026-09-06 against platform.claude.com/docs/en/about-claude/pricing.
 * When Anthropic publishes new prices, edit this file — it's the single source
 * of truth referenced by `jsonl-parser.calculateCost` and any future
 * invoice/report code. Tests in `pricing.test.ts` lock the exact values so an
 * accidental edit doesn't slip past the suite.
 *
 * A tier is "every live model that bills the same", NOT one model family:
 * Sonnet 5 ($2/$10) and Sonnet 4.6 ($3/$15) are both current, so a plain
 * `includes("sonnet")` would over-bill Sonnet 5 by half again. Where versions
 * of one family do agree — Opus 4.5 through 5 all at $5/$25 — they share a
 * tier and new releases need no edit here.
 *
 * Retired models (Opus 4.1/4 at $15/$75, Haiku 3.5 at $0.80/$4) are priced at
 * their successor's current rate. Historical sessions on them are rare and
 * Claude Code runs current models.
 */

export type ModelFamily =
  | "opus"
  | "sonnet-5"
  | "sonnet"
  | "haiku"
  | "fable-5-1"
  | "fable"
  | "unknown";

export interface PricingRate {
  /** Plain input tokens (no cache). */
  input: number;
  /** Output tokens. */
  output: number;
  /** Cache write — `cache_creation_input_tokens` in JSONL. */
  cacheWrite: number;
  /** Cache hit — `cache_read_input_tokens` in JSONL. */
  cacheRead: number;
}

/** Calendar date the rates below were last verified against the
 *  Anthropic public pricing page. Surfaced in the footer so users know
 *  whether the cost numbers are current or stale. Update alongside any
 *  edit to PRICING. */
export const PRICING_AS_OF = "2026-09-06";

export const PRICING: Record<ModelFamily, PricingRate> = {
  opus: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  // Fable and Mythos share a price sheet, but 5.1 reads cache at 0.025x base
  // instead of the usual 0.1x — $0.25 rather than $1. Worth its own tier: these
  // are cache-read-dominated workloads, so the multiplier drives the bill.
  "fable-5-1": { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
  fable: { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 },
  unknown: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
};

/**
 * Match a raw model id (`claude-opus-4-7`, `claude-sonnet-5-20260101`,
 * `claude-haiku-4-5-20251001`, ...) to its pricing tier.
 *
 * Substring match keeps it forward-compatible: a future `claude-opus-6` still
 * resolves to `opus` without a code change. The one place that is not enough
 * is Sonnet, where 5 and 4.x are both live at different prices — so the major
 * version is probed first, anchored on `sonnet-5` so `sonnet-4-5` cannot match
 * it. Unknown models return `unknown` (cost 0) so we never fabricate a number.
 */
export function modelFamily(modelId: string): ModelFamily {
  const id = modelId.toLowerCase();
  if (id.includes("opus")) return "opus";
  if (id.includes("sonnet")) return id.includes("sonnet-5") ? "sonnet-5" : "sonnet";
  if (id.includes("haiku")) return "haiku";
  if (id.includes("fable") || id.includes("mythos")) {
    return id.includes("-5-1") ? "fable-5-1" : "fable";
  }
  return "unknown";
}

/**
 * Convert a cost in USD to integer micro-USD for storage. SQLite never sees
 * floats this way — sums and aggregations stay exact. Lives here rather than
 * in the indexer because repricing has to round identically to indexing, or
 * every reprice would churn rows it did not actually change.
 */
export function toMicroUsd(usd: number): number {
  return Math.round(usd * 1_000_000);
}

export interface UsageTokens {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

/**
 * Cost in USD for one assistant message's usage block. Returns 0 for
 * unknown models — caller can detect that via `modelFamily` if it needs
 * to flag the row.
 */
export function calculateCost(modelId: string, tokens: UsageTokens): number {
  const rate = PRICING[modelFamily(modelId)];
  return (
    (rate.input * tokens.input +
      rate.output * tokens.output +
      rate.cacheWrite * tokens.cacheCreation +
      rate.cacheRead * tokens.cacheRead) /
    1_000_000
  );
}
