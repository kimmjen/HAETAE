import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";

export interface ProjectEntry {
  slug: string;
  name: string;
  absolutePath: string;
  hasClaudeDir: boolean;
  /** True iff Claude Code has at least one session log on disk for this
      cwd. UI uses this to pick `claude --continue` over plain `claude`. */
  hasSession: boolean;
  source: "env" | "user";
  /** Present only when source === "user". Used by DELETE /api/projects/roots/:id */
  id?: number;
}

export const projectsQueryOptions = queryOptions({
  queryKey: ["projects", "list"] as const,
  queryFn: ({ signal }) => apiGet<ProjectEntry[]>("/api/projects", { signal }),
  staleTime: 60_000,
});

export function useProjects() {
  return useQuery(projectsQueryOptions);
}
