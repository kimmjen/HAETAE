import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";
import { MODELS, type WikiModel } from "@/lib/models";

// Re-exported for existing call sites (ProjectWikiPanel) — single source in lib/models.
export const WIKI_MODELS = MODELS;
export type { WikiModel };

export interface ProjectWikiRow {
  id: number;
  projectPath: string;
  content: string;
  /** Cumulative messages folded into the wiki across all generations. */
  messagesCovered: number;
  generatedAt: number;
  summary: string | null;
  model: string;
  lastMessageTs: number;
  lastMessageUuid: string;
  createdAt: number;
  updatedAt: number;
  /** Unfolded messages after the current watermark. */
  pendingMessages: number;
  isStale: boolean;
}

export interface WikiGenerateResult {
  projectPath: string;
  messagesCovered: number;
  /** Messages folded in THIS generation. */
  foldedMessages: number;
  /** Messages still unfolded (backlog over budget) after this generation. */
  pendingMessages: number;
  content: string;
  summary: string | null;
  model: string;
  claudeMd: { path: string; action: "created" | "replaced" | "appended" } | null;
  /** True when there was nothing new to fold. */
  noChange: boolean;
}

export function useProjectWiki(projectPath: string | null) {
  return useQuery({
    queryKey: ["project-wiki", projectPath],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({ projectPath: projectPath! }).toString();
      return apiGet<ProjectWikiRow>(`/api/wiki/page?${qs}`, { signal }).catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      });
    },
    enabled: !!projectPath,
    staleTime: 60_000,
    retry: false,
  });
}

export function useGenerateWiki() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, model, reset }: { projectPath: string; model: WikiModel; reset?: boolean }) =>
      apiPost<WikiGenerateResult>("/api/wiki/generate", { projectPath, model, reset }),
    onSuccess: (data) => {
      // Refetch the page so pendingMessages / isStale reflect the new watermark
      // (a generation may leave a backlog still pending → stays stale).
      qc.invalidateQueries({ queryKey: ["project-wiki", data.projectPath] });
      qc.invalidateQueries({ queryKey: ["wiki-history", data.projectPath] });
    },
  });
}

export interface WikiHistoryEntry {
  id: number;
  projectPath: string;
  summary: string | null;
  model: string;
  messagesCovered: number;
  generatedAt: number;
  archivedAt: number;
  contentLength: number;
}

export function useWikiHistory(projectPath: string | null, enabled = true) {
  return useQuery({
    queryKey: ["wiki-history", projectPath],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({ projectPath: projectPath! }).toString();
      return apiGet<{ data: WikiHistoryEntry[] }>(`/api/wiki/history?${qs}`, { signal });
    },
    enabled: !!projectPath && enabled,
    staleTime: 30_000,
  });
}

export function useRollbackWiki() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, historyId }: { projectPath: string; historyId: number }) =>
      apiPost<{ projectPath: string }>("/api/wiki/rollback", { projectPath, historyId }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["project-wiki", data.projectPath] });
      qc.invalidateQueries({ queryKey: ["wiki-history", data.projectPath] });
    },
  });
}

/** Materialize the brain as an Obsidian vault under <project>/.haetae/vault/. */
export function useVaultExport() {
  return useMutation({
    mutationFn: ({ projectPath }: { projectPath: string }) =>
      apiPost<{ dir: string; files: number }>("/api/wiki/vault/export", { projectPath }),
  });
}

export interface AutoWikiStatus {
  config: { enabled: boolean; intervalMs: number; debounceMs: number; cooldownMs: number };
  candidates: Array<{ projectPath: string; pendingMessages: number; generatedAt: number }>;
}

/** Self-improving loop status — is the auto-update scheduler armed, and what's queued. */
export function useAutoWikiStatus() {
  return useQuery({
    queryKey: ["auto-wiki-status"],
    queryFn: ({ signal }) => apiGet<AutoWikiStatus>("/api/wiki/auto-status", { signal }),
    staleTime: 30_000,
  });
}
