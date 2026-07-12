import type { RulesEntry } from "@/hooks/useRulesList";

/**
 * Substring filter the rules tree by file name or path. Case-insensitive.
 *
 * - Empty query returns the input unchanged.
 * - A directory survives only if it has at least one descendant that
 *   either matches itself or contains a matching descendant. The
 *   surviving directory is rebuilt with only its surviving children so
 *   the tree never shows nodes that the user filtered out.
 * - A file survives if `name` or `path` contains the query.
 *
 * Pure function — no React, no side effects, easy to unit test.
 */
export function filterRulesTree(entries: RulesEntry[], query: string): RulesEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return entries;

  const out: RulesEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "file") {
      if (matches(entry, trimmed)) out.push(entry);
      continue;
    }

    const filteredChildren = entry.children
      ? filterRulesTree(entry.children, trimmed)
      : [];

    // Keep the directory if any child survived, or if the directory's own
    // name/path matches (e.g. searching for "rules" should keep rules/).
    if (filteredChildren.length > 0 || matches(entry, trimmed)) {
      out.push({ ...entry, children: filteredChildren });
    }
  }
  return out;
}

function matches(entry: RulesEntry, lowerQuery: string): boolean {
  return (
    entry.name.toLowerCase().includes(lowerQuery) ||
    entry.path.toLowerCase().includes(lowerQuery)
  );
}
