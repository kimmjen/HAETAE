import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";

export interface EvalIssue {
  type: "accuracy" | "staleness" | "gap" | "vibe";
  severity: "high" | "medium" | "low";
  detail: string;
  fix: string;
}
export interface EvalReport {
  score: number;
  summary: string;
  issues: EvalIssue[];
}
export interface EvalResult {
  projectPath: string;
  report: EvalReport;
  model: string;
  generatedAt: number;
  wikiGeneratedAt: number | null;
  /** True when the wiki changed after this audit ran. */
  isStale: boolean;
}

export function useEval(projectPath: string | null) {
  return useQuery({
    queryKey: ["wiki-eval", projectPath],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({ projectPath: projectPath! }).toString();
      return apiGet<{ eval: EvalResult | null }>(`/api/wiki/eval?${qs}`, { signal });
    },
    enabled: !!projectPath,
    staleTime: 60_000,
  });
}

export interface EvalScorePoint {
  score: number;
  generatedAt: number;
}

/** Eval score trend (oldest→newest) — shows whether the self-correcting loop lifts trust. */
export function useEvalHistory(projectPath: string | null) {
  return useQuery({
    queryKey: ["wiki-eval-history", projectPath],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({ projectPath: projectPath! }).toString();
      return apiGet<{ history: EvalScorePoint[] }>(`/api/wiki/eval/history?${qs}`, { signal });
    },
    enabled: !!projectPath,
    staleTime: 60_000,
  });
}

export function useGenerateEval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, model }: { projectPath: string; model: string }) =>
      apiPost<EvalResult>("/api/wiki/eval/generate", { projectPath, model }),
    onSuccess: (data) => qc.setQueryData(["wiki-eval", data.projectPath], { eval: data }),
  });
}
