import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";

/**
 * Phase 5 hook surface — same shape as `useUsageLocal` but every
 * envelope.meta now carries `configured` and `fetchedAt`. Pages branch
 * on `meta.configured` to render lock-state without firing additional
 * fetches.
 */

export interface UsageApiMeta {
  generatedAt: string;
  totalEvents: number;
  configured: boolean;
  fetchedAt: number | null;
}

interface Envelope<T> {
  data: T;
  meta: UsageApiMeta;
}

export interface UsageApiSummary {
  days: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export interface UsageApiDayPoint {
  day: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export interface UsageApiModelRow {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  count: number;
}

export interface UsageApiUnifiedRow {
  day: string;
  localCostUsd: number;
  apiCostUsd: number;
  deltaUsd: number;
}

export interface UsageApiUnified {
  days: number;
  rows: UsageApiUnifiedRow[];
}

const STALE = 60_000; // 1 min — admin api responses change less often than local

function key(scope: string, days: number) {
  return ["usage-api", scope, days] as const;
}

export function useApiSummary(days = 30) {
  return useQuery({
    queryKey: key("summary", days),
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageApiSummary>>(`/api/usage/api/summary?days=${days}`, { signal }),
    staleTime: STALE,
  });
}

export function useApiByDay(days = 30) {
  return useQuery({
    queryKey: key("by-day", days),
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageApiDayPoint[]>>(`/api/usage/api/by-day?days=${days}`, { signal }),
    staleTime: STALE,
  });
}

export function useApiByModel(days = 30) {
  return useQuery({
    queryKey: key("by-model", days),
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageApiModelRow[]>>(`/api/usage/api/by-model?days=${days}`, { signal }),
    staleTime: STALE,
  });
}

export function useApiUnified(days = 30) {
  return useQuery({
    queryKey: key("unified", days),
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageApiUnified>>(`/api/usage/api/unified?days=${days}`, { signal }),
    staleTime: STALE,
  });
}

export function useRefreshApi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{
        data: { usageBuckets: number; costBuckets: number; fetchedAt: number };
      }>("/api/usage/api/refresh", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usage-api"] }),
  });
}
