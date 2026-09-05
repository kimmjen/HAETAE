/** Single source of truth for the Claude models offered in model pickers.
 *  Hand-mirrors the server's CLAUDE_MODELS (apps/server/src/services/memory/
 *  claude-cli.ts) — that module imports node:child_process so the browser
 *  bundle cannot pull it in. A test there reads this file and fails on drift;
 *  edit both together, same order. Values are CLI tier aliases, so they never
 *  need a version bump. */
export type WikiModel = "sonnet" | "opus" | "haiku";

// Sonnet first — it's the default (balances brain quality against the CLI
// quota every call spends). Opus stays available for anyone who wants it.
export const MODELS: Array<{ value: WikiModel; label: string }> = [
  { value: "sonnet", label: "Sonnet (default)" },
  { value: "opus", label: "Opus" },
  { value: "haiku", label: "Haiku" },
];

/** Model used when a panel generates without an explicit pick. */
export const DEFAULT_MODEL: WikiModel = MODELS[0].value;

/** Short display label, e.g. "claude-opus-4-7" → "opus-4-7". */
export function shortModel(model: string): string {
  return model.replace("claude-", "").replace("-20251001", "");
}
