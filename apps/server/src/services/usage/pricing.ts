/**
 * Anthropic public pricing for Claude Code traffic. Per 1M tokens, USD.
 *
 * Updated 2026-06-06 against platform.claude.com/docs/en/about-claude/pricing.
 * When Anthropic publishes new prices, edit this file — it's the single source
 * of truth referenced by `jsonl-parser.calculateCost` and any future
 * invoice/report code. Tests in `pricing.test.ts` lock the exact values so an
 * accidental edit doesn't slip past CI.
 *
 * Family rates track the CURRENT Claude Code models: Opus 4.5–4.8 ($5/$25),
 * Sonnet 4.5/4.6 ($3/$15), Haiku 4.5 ($1/$5). The substring family match can't
 * tell model versions apart, so historical sessions on now-deprecated Opus
 * 4.1/4 ($15/$75) or retired Haiku 3.5 ($0.80/$4) are priced at current rates —
 * acceptable since Claude Code runs the current models.
 */

export type ModelFamily = "opus" | "sonnet" | "haiku" | "unknown";

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
export const PRICING_AS_OF = "2026-06-06";

export const PRICING: Record<ModelFamily, PricingRate> = {
  opus: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  unknown: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
};

/**
 * Match a raw model id (`claude-opus-4-7`, `claude-sonnet-4-6`,
 * `claude-haiku-4-5-20251001`, ...) to its pricing family.
 *
 * Substring match keeps it forward-compatible: a future `claude-opus-5`
 * will still resolve to `opus` without a code change. Unknown models
 * return `unknown` (cost 0) so we never fabricate a number.
 */
export function modelFamily(modelId: string): ModelFamily {
  const id = modelId.toLowerCase();
  if (id.includes("opus")) return "opus";
  if (id.includes("sonnet")) return "sonnet";
  if (id.includes("haiku")) return "haiku";
  return "unknown";
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
