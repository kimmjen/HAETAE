import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { appendScope, scopeKey, type Scope } from "@/lib/scope";

export interface FileResponse {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  mtime: number;
}

/**
 * Build the queryOptions for a single rules file. Exported so route
 * loaders can use it via context.queryClient.ensureQueryData.
 */
export function fileQueryOptions(filePath: string, scope: Scope = "global") {
  const url = appendScope(
    `/api/rules/file?path=${encodeURIComponent(filePath)}`,
    scope,
  );
  return queryOptions({
    queryKey: ["rules", "file", scopeKey(scope), filePath] as const,
    queryFn: ({ signal }) => apiGet<FileResponse>(url, { signal }),
  });
}

/**
 * Reads the file at `filePath` from the server. When `filePath` is
 * null (no selection yet) the query stays disabled and returns the
 * idle state — consumers branch on `data` / `isPending`.
 */
export function useFile(filePath: string | null, scope: Scope = "global") {
  return useQuery({
    ...fileQueryOptions(filePath ?? "__noop__", scope),
    enabled: filePath !== null && filePath.length > 0,
  });
}
