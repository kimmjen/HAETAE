import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";
import type { WikiModel } from "@/lib/models";
import type { TopicPage } from "./useProjectGraph";
import type { EvalReport } from "./useEval";

/**
 * The GLOBAL brain — cross-project synthesis above the per-project wikis.
 * Singletons (no projectPath): wiki ← all project wikis, topics ← global wiki,
 * eval ← global wiki. Mirrors the per-project wiki/topics/eval hooks but keyed
 * globally. Server wraps reads in { data } and 404s until a layer is built.
 */

export interface GlobalWikiResult {
  content: string;
  model: string;
  projectsCovered: number;
  generatedAt: number;
  /** Newest project-wiki time — the source; drives staleness. */
  sourceGeneratedAt: number | null;
  isStale: boolean;
}

export interface GlobalTopicsResult {
  topics: TopicPage[];
  model: string;
  generatedAt: number;
  wikiGeneratedAt: number | null;
  isStale: boolean;
  updatedSlugs: string[];
}

export interface GlobalEvalResult {
  report: EvalReport;
  model: string;
  generatedAt: number;
  wikiGeneratedAt: number | null;
  isStale: boolean;
}

/** GET a global layer, unwrapping { data } and mapping 404 → null (not built). */
function getLayer<T>(path: string, signal: AbortSignal) {
  return apiGet<{ data: T }>(path, { signal })
    .then((r) => r.data)
    .catch((err) => {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    });
}

export function useGlobalWiki() {
  return useQuery({
    queryKey: ["global-wiki"],
    queryFn: ({ signal }) => getLayer<GlobalWikiResult>("/api/brain/global/wiki", signal),
    staleTime: 60_000,
    retry: false,
  });
}

export function useGlobalTopics() {
  return useQuery({
    queryKey: ["global-topics"],
    queryFn: ({ signal }) => getLayer<GlobalTopicsResult>("/api/brain/global/topics", signal),
    staleTime: 60_000,
    retry: false,
  });
}

export function useGlobalEval() {
  return useQuery({
    queryKey: ["global-eval"],
    queryFn: ({ signal }) => getLayer<GlobalEvalResult>("/api/brain/global/eval", signal),
    staleTime: 60_000,
    retry: false,
  });
}

export function useGenerateGlobalWiki() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ model }: { model: WikiModel }) =>
      apiPost<{ data: GlobalWikiResult }>("/api/brain/global/wiki/generate", { model }).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(["global-wiki"], data);
      // Regenerating the wiki makes the derived layers stale — refetch their badges.
      qc.invalidateQueries({ queryKey: ["global-topics"] });
      qc.invalidateQueries({ queryKey: ["global-eval"] });
    },
  });
}

export function useGenerateGlobalTopics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ model }: { model: WikiModel }) =>
      apiPost<{ data: GlobalTopicsResult }>("/api/brain/global/topics/generate", { model }).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(["global-topics"], data),
  });
}

export function useGenerateGlobalEval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ model }: { model: WikiModel }) =>
      apiPost<{ data: GlobalEvalResult }>("/api/brain/global/eval/generate", { model }).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(["global-eval"], data),
  });
}
