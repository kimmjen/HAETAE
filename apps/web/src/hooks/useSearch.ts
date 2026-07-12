import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { appendScope, scopeKey, type Scope } from "@/lib/scope";

export interface SearchMatch {
  line: number;
  text: string;
}

export interface SearchResult {
  path: string;
  matches: SearchMatch[];
}

export const MIN_QUERY_LEN = 2;

export function searchQueryOptions(query: string, scope: Scope = "global") {
  const url = appendScope(
    `/api/rules/search?q=${encodeURIComponent(query)}`,
    scope,
  );
  return queryOptions({
    queryKey: ["rules", "search", scopeKey(scope), query] as const,
    queryFn: ({ signal }) => apiGet<SearchResult[]>(url, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useSearch(query: string, scope: Scope = "global") {
  const trimmed = query.trim();
  return useQuery({
    ...searchQueryOptions(trimmed, scope),
    enabled: trimmed.length >= MIN_QUERY_LEN,
  });
}
