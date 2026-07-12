import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";

export interface MemoryRow {
  id: number;
  summaryUuid: string | null;
  sessionId: string;
  projectPath: string;
  content: string;
  source: string;
  compactTrigger: string | null;
  compactPreTokens: number | null;
  compactPostTokens: number | null;
  ts: number;
  createdAt: number;
}

interface MemoriesEnvelope {
  data: MemoryRow[];
  meta: { total: number; limit: number; offset: number; generatedAt: string };
}

export function useMemories(opts: { projectPath?: string; limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.projectPath) params.set("projectPath", opts.projectPath);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();

  return useQuery({
    queryKey: ["memories", opts],
    queryFn: ({ signal }) =>
      apiGet<MemoriesEnvelope>(`/api/memories${qs ? `?${qs}` : ""}`, { signal }),
    staleTime: 30_000,
  });
}
