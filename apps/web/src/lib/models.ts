/** Single source of truth for the Claude models offered in model pickers.
 *  Mirrors the server's CLAUDE_MODELS (apps/server/src/services/memory/claude-cli.ts). */
export type WikiModel =
  | "claude-opus-4-8"
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

export const MODELS: Array<{ value: WikiModel; label: string }> = [
  { value: "claude-opus-4-8", label: "Opus 4.8" },
  { value: "claude-opus-4-7", label: "Opus 4.7" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

/** Short display label, e.g. "claude-opus-4-7" → "opus-4-7". */
export function shortModel(model: string): string {
  return model.replace("claude-", "").replace("-20251001", "");
}
