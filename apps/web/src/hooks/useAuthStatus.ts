import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";

export interface AuthStatus {
  loggedIn: boolean;
  authMethod: string | null;
  apiProvider: string | null;
  email: string | null;
  orgId: string | null;
  orgName: string | null;
  subscriptionType: string | null;
}

interface Envelope<T> {
  data: T;
  meta: { generatedAt: string; cacheTtlMs?: number };
}

const KEY = ["system", "auth-status"] as const;

export function useAuthStatus() {
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) =>
      apiGet<Envelope<AuthStatus>>("/api/system/auth-status", { signal }),
    // 서버가 30분 캐시를 들고 있으니 클라이언트는 더 짧게 둬도 비용 동일.
    staleTime: 5 * 60 * 1000,
  });
}

export function useRefreshAuthStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<Envelope<AuthStatus>>("/api/system/auth-status/refresh", {}),
    onSuccess: (res) => qc.setQueryData(KEY, res),
  });
}
