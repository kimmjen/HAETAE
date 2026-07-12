import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";

export interface VoiceProfile {
  content: string;
  model: string;
  messagesCovered: number;
  generatedAt: number;
}

export function useVoice() {
  return useQuery({
    queryKey: ["voice"],
    queryFn: ({ signal }) => apiGet<{ profile: VoiceProfile | null }>("/api/voice", { signal }),
    staleTime: 60_000,
  });
}

export function useGenerateVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ model }: { model: string }) => apiPost<VoiceProfile>("/api/voice/generate", { model }),
    onSuccess: (data) => qc.setQueryData(["voice"], { profile: data }),
  });
}

export function useInjectVoice() {
  return useMutation({
    mutationFn: () => apiPost<{ path: string; action: "created" | "updated" }>("/api/voice/inject", {}),
  });
}
