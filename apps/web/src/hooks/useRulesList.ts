import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { appendScope, scopeKey, type Scope } from "@/lib/scope";

export interface RulesEntry {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: RulesEntry[];
}

/** Mirrors server's claude-fs `TreeCategory` (ADR 0007). */
export type TreeCategory = "rules" | "skills";

function buildListUrl(scope: Scope, category?: TreeCategory): string {
  const base = appendScope("/api/rules/list", scope);
  if (!category) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}category=${category}`;
}

export function rulesListQueryOptions(
  scope: Scope = "global",
  category?: TreeCategory,
) {
  return queryOptions({
    queryKey: ["rules", "list", scopeKey(scope), category ?? "all"] as const,
    queryFn: ({ signal }) =>
      apiGet<RulesEntry[]>(buildListUrl(scope, category), { signal }),
  });
}

export function useRulesList(scope: Scope = "global", category?: TreeCategory) {
  return useQuery(rulesListQueryOptions(scope, category));
}
