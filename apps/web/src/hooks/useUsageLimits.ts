import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";

export interface UsageWindow {
  utilization: number;
  resetsAt: string | null;
}

export interface UsageLimits {
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  sevenDayOpus: UsageWindow | null;
  sevenDaySonnet: UsageWindow | null;
  extra: {
    enabled: boolean;
    monthlyLimit: number;
    usedCredits: number;
    utilization: number | null;
    currency: string;
  } | null;
  subscriptionType: string | null;
  oauthExpiresAt: number;
}

interface Envelope {
  data: UsageLimits | null;
  meta: { generatedAt: string; cacheTtlMs?: number; source: string };
}

const KEY = ["system", "usage-limits"] as const;

export function useUsageLimits() {
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) =>
      apiGet<Envelope>("/api/system/usage-limits", { signal }),
    // 5h 윈도우 추적이라 자주 업데이트해야 의미. 서버 캐시도 5분.
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useRefreshUsageLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<Envelope>("/api/system/usage-limits/refresh", {}),
    onSuccess: (res) => qc.setQueryData(KEY, res),
  });
}
