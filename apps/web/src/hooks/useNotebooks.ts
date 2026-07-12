import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";
import type { ProjectGraphData } from "@/hooks/useProjectGraph";

// ADR 0010 — these hit the NotebookLM Python (FastAPI) app via the /py proxy
// (Vite in dev, Fastify in prod). Field shapes are the Python service's
// snake_case JSON.

export interface NotebookRow {
  notebook_id: string;
  title: string;
  is_owner: number;
  created_at: string | null;
  sources_count: number;
  mirrored_at: number;
}

export interface SourceRow {
  notebook_id: string;
  source_id: string;
  title: string;
  url: string | null;
  status: number | null;
  mirrored_at: number;
}

export interface QaRow {
  id: number;
  notebook_id: string;
  question: string;
  answer: string;
  asked_at: number;
}

export interface NotebookLmAuth {
  status: "ok" | "no_auth" | "expired" | "error";
  profile: string;
  /** Login command, relative to login_cwd (kept short so it doesn't wrap). */
  login_command: string;
  /** Dir to spawn the terminal in, so the relative login_command resolves. */
  login_cwd: string;
  detail?: string;
}

/** Probe NotebookLM auth (live call) so Settings can show status + login command. */
export function useNotebookLmAuth() {
  return useQuery({
    queryKey: ["notebooklm", "auth-status"],
    queryFn: ({ signal }) => apiGet<NotebookLmAuth>("/py/notebooklm/auth-status", { signal }),
    staleTime: 30_000,
    retry: false,
  });
}

/** Mirrored notebooks from the local DB (no live call). */
export function useNotebooks() {
  return useQuery({
    queryKey: ["notebooklm", "notebooks"],
    queryFn: ({ signal }) =>
      apiGet<{ notebooks: NotebookRow[] }>("/py/notebooklm/notebooks", { signal }),
    staleTime: 30_000,
  });
}

export function useNotebookSources(notebookId: string | null) {
  return useQuery({
    queryKey: ["notebooklm", "sources", notebookId],
    queryFn: ({ signal }) =>
      apiGet<{ sources: SourceRow[] }>(
        `/py/notebooklm/notebooks/${notebookId}/sources`,
        { signal },
      ),
    enabled: !!notebookId,
    staleTime: 30_000,
  });
}

export function useNotebookQa(notebookId: string | null) {
  return useQuery({
    queryKey: ["notebooklm", "qa", notebookId],
    queryFn: ({ signal }) =>
      apiGet<{ qa: QaRow[] }>(`/py/notebooklm/notebooks/${notebookId}/qa`, { signal }),
    enabled: !!notebookId,
    staleTime: 10_000,
  });
}

/** Pull notebooks+sources from NotebookLM into the local mirror. */
export function useSyncNotebooks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{ ok: boolean; notebooks: number; sources: number }>(
        "/py/notebooklm/sync",
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notebooklm"] });
    },
  });
}

/** Second-brain graph of mirrored notebooks/sources (ADR 0010, option B). */
export function useNotebookGraph(enabled = true) {
  return useQuery({
    queryKey: ["notebooklm", "graph"],
    queryFn: ({ signal }) =>
      apiGet<ProjectGraphData>("/py/notebooklm/graph", { signal }),
    enabled,
    staleTime: 30_000,
  });
}

/** Ask a grounded question; the answer (with inline citations) is stored. */
export function useAskNotebook(notebookId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (question: string) =>
      apiPost<{ answer: string }>(`/py/notebooklm/notebooks/${notebookId}/ask`, {
        question,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notebooklm", "qa", notebookId] });
    },
  });
}
