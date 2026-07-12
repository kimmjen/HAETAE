import type { RulesEntry } from "@/hooks/useRulesList";

/**
 * Flatten a rules tree into the set of file paths it contains. Used by
 * the diff entry-point to decide whether the same relPath also exists
 * in another scope without issuing per-file probes.
 */
export function collectFilePaths(entries: RulesEntry[]): Set<string> {
  const out = new Set<string>();
  function walk(es: RulesEntry[]): void {
    for (const e of es) {
      if (e.type === "file") out.add(e.path);
      else if (e.children) walk(e.children);
    }
  }
  walk(entries);
  return out;
}
