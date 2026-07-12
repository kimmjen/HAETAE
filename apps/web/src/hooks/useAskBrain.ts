import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api-client";

export interface BrainSource {
  tag: string;
  sessionId: string;
  ts: number;
  snippet: string;
}

export interface AskResult {
  question: string;
  answer: string;
  sources: BrainSource[];
  model: string;
}

export function useAskBrain() {
  return useMutation({
    mutationFn: ({ projectPath, question, model }: { projectPath: string; question: string; model?: string }) =>
      apiPost<AskResult>("/api/wiki/ask", { projectPath, question, model }),
  });
}
