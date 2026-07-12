import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api-client";

export interface UsageMeta {
  generatedAt: string;
  totalEvents: number;
}

interface Envelope<T> {
  data: T;
  meta: UsageMeta;
}

export interface UsageSummary {
  days: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export interface UsageDayPoint {
  day: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export interface UsageModelRow {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  count: number;
}

export interface UsageProjectRow {
  projectPath: string;
  label: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  count: number;
}

export interface UsageHeatmapCell {
  dayOfWeek: number;
  hour: number;
  costUsd: number;
  count: number;
}

export interface UsageHeatmap {
  days: number;
  cells: UsageHeatmapCell[];
}

const STALE = 30_000; // 30s — usage shifts slowly; refresh button forces invalidation
// Background polling so newly-indexed sessions surface without the user
// pressing Sync. Server re-indexes on the same cadence (see
// HAETAE_INDEXER_INTERVAL_MS in apps/server/src/index.ts), so the average
// observed lag is roughly half this value.
const REFETCH = 30_000;

function buildKey(scope: string, days: number) {
  return ["usage-local", scope, days] as const;
}

export function useUsageSummary(days: number = 30) {
  return useQuery({
    queryKey: buildKey("summary", days),
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageSummary>>(`/api/usage/local/summary?days=${days}`, { signal }),
    staleTime: STALE,
    refetchInterval: REFETCH,
  });
}

export function useUsageByDay(days: number = 30) {
  return useQuery({
    queryKey: buildKey("by-day", days),
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageDayPoint[]>>(`/api/usage/local/by-day?days=${days}`, { signal }),
    staleTime: STALE,
    refetchInterval: REFETCH,
  });
}

export function useUsageByModel(days: number = 30) {
  return useQuery({
    queryKey: buildKey("by-model", days),
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageModelRow[]>>(`/api/usage/local/by-model?days=${days}`, { signal }),
    staleTime: STALE,
    refetchInterval: REFETCH,
  });
}

export function useUsageByProject(days: number = 30) {
  return useQuery({
    queryKey: buildKey("by-project", days),
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageProjectRow[]>>(`/api/usage/local/by-project?days=${days}`, { signal }),
    staleTime: STALE,
    refetchInterval: REFETCH,
  });
}

export function useUsageHeatmap(days: number = 30) {
  return useQuery({
    queryKey: buildKey("heatmap", days),
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageHeatmap>>(`/api/usage/local/heatmap?days=${days}`, { signal }),
    staleTime: STALE,
    refetchInterval: REFETCH,
  });
}

export interface UsageRecentSession {
  sessionId: string;
  projectPath: string;
  label: string;
  model: string;
  lastTs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  eventCount: number;
}

export interface UsageWindowBucket {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  count: number;
}

export interface UsageWindows {
  now: number;
  windows: {
    last5h: UsageWindowBucket;
    last24h: UsageWindowBucket;
    last7d: UsageWindowBucket;
    monthToDate: UsageWindowBucket;
  };
}

export function useUsageWindows() {
  return useQuery({
    queryKey: ["usage-local", "windows"] as const,
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageWindows>>(`/api/usage/local/windows`, { signal }),
    staleTime: STALE,
    refetchInterval: REFETCH,
  });
}

export interface ProjectSessionRow {
  sessionId: string;
  model: string;
  lastTs: number;
  firstTs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  eventCount: number;
}

export function useProjectSessions(projectPath: string | undefined, limit = 50) {
  return useQuery({
    enabled: typeof projectPath === "string" && projectPath.length > 0,
    queryKey: ["usage-local", "project-sessions", projectPath, limit] as const,
    queryFn: ({ signal }) =>
      apiGet<Envelope<ProjectSessionRow[]>>(
        `/api/usage/local/project-sessions?projectPath=${encodeURIComponent(projectPath!)}&limit=${limit}`,
        { signal },
      ),
    staleTime: STALE,
    refetchInterval: REFETCH,
  });
}

export interface SessionListRow {
  sessionId: string;
  projectPath: string;
  label: string;
  model: string;
  lastTs: number;
  firstTs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  eventCount: number;
}

export function useSessionsList(opts: {
  days?: number;
  projectPath?: string;
  limit?: number;
}) {
  const { days = 30, projectPath, limit = 100 } = opts;
  const params = new URLSearchParams({ days: String(days), limit: String(limit) });
  if (projectPath) params.set("projectPath", projectPath);
  return useQuery({
    queryKey: ["usage-local", "sessions", days, projectPath ?? "", limit] as const,
    queryFn: ({ signal }) =>
      apiGet<Envelope<SessionListRow[]>>(
        `/api/usage/local/sessions?${params.toString()}`,
        { signal },
      ),
    staleTime: STALE,
    refetchInterval: REFETCH,
  });
}

export function useRecentSessions(limit: number = 5) {
  return useQuery({
    queryKey: ["usage-local", "recent-sessions", limit] as const,
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageRecentSession[]>>(
        `/api/usage/local/recent-sessions?limit=${limit}`,
        { signal },
      ),
    staleTime: STALE,
    refetchInterval: REFETCH,
  });
}

export interface UsageInsights {
  days: number;
  hitRatio: number;
  cacheReadTokens: number;
  cacheSavingsUsd: number;
  perModel: Array<{
    model: string;
    inputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    hitRatio: number;
    savingsUsd: number;
    count: number;
  }>;
  perProject: Array<{
    projectPath: string;
    label: string;
    inputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    hitRatio: number;
    count: number;
  }>;
}

export function useUsageInsights(days: number = 30) {
  return useQuery({
    queryKey: buildKey("insights", days),
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageInsights>>(`/api/usage/local/insights?days=${days}`, { signal }),
    staleTime: STALE,
    refetchInterval: REFETCH,
  });
}

export interface UsageRecentEvent {
  sessionId: string;
  messageId: string;
  projectPath: string;
  label: string;
  model: string;
  ts: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

export function useRecentEvents(limit: number = 10) {
  return useQuery({
    queryKey: ["usage-local", "recent-events", limit] as const,
    queryFn: ({ signal }) =>
      apiGet<Envelope<UsageRecentEvent[]>>(
        `/api/usage/local/recent-events?limit=${limit}`,
        { signal },
      ),
    staleTime: STALE,
    refetchInterval: REFETCH,
  });
}

export interface SessionMessagePart {
  kind: "text" | "thinking" | "tool_use" | "tool_result";
  text?: string;
  truncated?: boolean;
  toolName?: string;
  toolInputPreview?: string;
}

export interface SessionMessage {
  uuid: string;
  role: "user" | "assistant";
  ts: number;
  parts: SessionMessagePart[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    model: string;
  };
}

export interface SessionMeta {
  sessionId: string;
  projectPath: string | null;
  startTime: number | null;
  durationMinutes: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCounts: Record<string, number>;
  firstPrompt: string | null;
  userInterruptions: number;
  toolErrors: number;
  gitCommits: number;
  gitPushes: number;
  linesAdded: number;
  linesRemoved: number;
  filesModified: number;
  usesTaskAgent: boolean;
  usesMcp: boolean;
  usesWebSearch: boolean;
  usesWebFetch: boolean;
}

export interface SessionDetail {
  sessionId: string;
  projectPath: string;
  filePath: string;
  startedAt: number | null;
  endedAt: number | null;
  truncated: boolean;
  totals: {
    messages: number;
    assistantMessages: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
  };
  meta: SessionMeta | null;
  messages: SessionMessage[];
}

export function useSessionDetail(sessionId: string | undefined) {
  return useQuery({
    enabled: typeof sessionId === "string" && sessionId.length > 0,
    queryKey: ["usage-local", "session-detail", sessionId] as const,
    queryFn: ({ signal }) =>
      apiGet<Envelope<SessionDetail>>(
        `/api/usage/local/sessions/${sessionId}`,
        { signal },
      ),
    staleTime: STALE,
    retry: false,
  });
}

/** JSONL 파일 mtime 기반 — 120s 이내에 수정된 세션을 "Live" 로 판단. */
export function useActiveSessions() {
  return useQuery({
    queryKey: ["usage-local", "active-sessions"] as const,
    queryFn: ({ signal }) =>
      apiGet<{ data: { sessionIds: string[]; checkedAt: number }; meta: { generatedAt: string } }>(
        "/api/usage/local/active-sessions",
        { signal },
      ),
    staleTime: 0,
    refetchInterval: 15_000,
  });
}

/**
 * Triggers a server-side `indexAll` and invalidates every usage query
 * on success so the page re-fetches fresh aggregations. The button that
 * fires this is the user's only manual refresh path — there's no
 * polling, so the click really matters.
 */
export function useRefreshUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{ data: { filesScanned: number; totalInserted: number } }>(
        "/api/usage/local/refresh",
        {},
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usage-local"] }),
  });
}
