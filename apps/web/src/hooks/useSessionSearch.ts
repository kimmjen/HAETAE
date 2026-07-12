import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";

export interface SessionSearchHit {
  sessionId: string;
  projectPath: string;
  role: string;
  ts: number;
  snippet: string;
}

interface SessionSearchEnvelope {
  data: SessionSearchHit[];
  meta: { total: number; mode: string; q: string };
}

interface SessionSearchOpts {
  q: string;
  projectPath?: string;
  days?: number;
  limit?: number;
  enabled?: boolean;
}

/** Cross-project full-text conversation search (P7.2). Runs once q has 2+ chars. */
export function useSessionSearch(opts: SessionSearchOpts) {
  const q = opts.q.trim();
  const params = new URLSearchParams({ q });
  if (opts.projectPath) params.set("projectPath", opts.projectPath);
  if (opts.days) params.set("days", String(opts.days));
  if (opts.limit) params.set("limit", String(opts.limit));

  return useQuery({
    queryKey: ["brain-search", q, opts.projectPath ?? "", opts.days ?? 0, opts.limit ?? 0],
    queryFn: ({ signal }) =>
      apiGet<SessionSearchEnvelope>(`/api/brain/search?${params.toString()}`, { signal }),
    enabled: (opts.enabled ?? true) && q.length >= 2,
    staleTime: 30_000,
  });
}
