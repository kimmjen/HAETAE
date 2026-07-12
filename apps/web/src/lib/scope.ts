/**
 * Scope is a single string passed to the rules API:
 *   undefined / "global" → ~/.claude
 *   any other string     → project slug
 *
 * Hooks accept `Scope | undefined` and translate to a `?scope=` query
 * only when it is a non-global value.
 */
export type Scope = string | undefined;

export function appendScope(url: string, scope: Scope): string {
  if (scope === undefined || scope === "global" || scope === "") return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}scope=${encodeURIComponent(scope)}`;
}

/** Stable representation for query keys. */
export function scopeKey(scope: Scope): string {
  if (scope === undefined || scope === "" || scope === "global") return "global";
  return scope;
}
