import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";

export interface BrainIndexProject {
  projectPath: string;
  label: string;
  wikiGeneratedAt: number;
  wikiSummary: string | null;
  evalScore: number | null;
  wikiStale: boolean;
  noteCount: number;
  conceptCount: number;
}

export interface BrainIndexNote {
  projectPath: string;
  slug: string;
  title: string;
  degree: number;
  stale: boolean;
}

export interface BrainIndexConcept {
  projectPath: string;
  id: string;
  label: string;
  kind: string;
  stale: boolean;
}

interface BrainIndexEnvelope {
  data: { projects: BrainIndexProject[]; notes: BrainIndexNote[]; concepts: BrainIndexConcept[] };
  meta: { projectCount: number; noteCount: number; conceptCount: number; generatedAt: string };
}

/** Cross-project knowledge catalog — all projects' wiki/notes/concepts at once. */
export function useKnowledge() {
  return useQuery({
    queryKey: ["brain-index"],
    queryFn: ({ signal }) => apiGet<BrainIndexEnvelope>("/api/brain/index", { signal }),
    staleTime: 30_000,
  });
}

export interface RecalledNote {
  projectPath: string;
  projectName: string;
  slug: string;
  title: string;
  content: string;
}

interface RecallEnvelope {
  data: RecalledNote[];
  meta: { count: number; model: string; query: string };
}

/** Cross-project meaning-based note recall (web surface for recall_global). LLM, so a mutation. */
export function useBrainRecall() {
  return useMutation({
    mutationFn: (query: string) => apiPost<RecallEnvelope>("/api/brain/recall", { query }),
  });
}
