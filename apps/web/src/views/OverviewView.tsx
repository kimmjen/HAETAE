import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  formatLocalTimestamp,
  formatRelativeTime,
  formatTokens,
  formatTokensCompact,
} from "@/lib/format";
import { useMoney } from "@/lib/currency";
import { OverviewTrend } from "@/components/OverviewTrend";
import { WindowsPanel } from "@/components/WindowsPanel";
import { BrainLoopPanel } from "@/components/BrainLoopPanel";
import {
  useRecentEvents,
  useRecentSessions,
  useUsageByDay,
  useUsageSummary,
  type UsageRecentEvent,
  type UsageRecentSession,
} from "@/hooks/useUsageLocal";

interface StatCardData {
  label: string;
  value: number;
  /** 0..100 — width of the bottom progress bar. */
  progress: number;
  accent?: boolean;
}

/**
 * Watching → Overview. Bloomberg-tone summary that reads as a single
 * dashboard: three stat cards above a trend bar chart and a recent-
 * sessions panel, with an audit table at the bottom. The visual layout
 * itself is the design anchor for the app — Recharts lives on the
 * dedicated /watching/local detail page.
 *
 * Every panel runs on live `usage-local` data — Recent Sessions groups
 * by sessionId, Audit lists individual assistant messages newest first.
 */
export function OverviewView() {
  const summary = useUsageSummary(30);
  const byDay = useUsageByDay(30);
  const recentSessions = useRecentSessions(5);
  const recentEvents = useRecentEvents(10);

  const stats = useMemo<StatCardData[]>(() => {
    const sum = summary.data?.data;
    const input = sum?.inputTokens ?? 0;
    const output = sum?.outputTokens ?? 0;
    const cacheRead = sum?.cacheReadTokens ?? 0;
    const max = Math.max(input, output, cacheRead, 1);
    return [
      { label: "Input Tokens / 30D", value: input, progress: (input / max) * 100 },
      { label: "Output Tokens / 30D", value: output, progress: (output / max) * 100 },
      {
        label: "Cache Read / 30D",
        value: cacheRead,
        progress: (cacheRead / max) * 100,
        accent: true,
      },
    ];
  }, [summary.data]);

  return (
    <div className="space-y-4">
      <WindowsPanel />

      <div className="grid grid-cols-3 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} data={stat} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <OverviewTrend data={byDay.data?.data ?? []} />
        <RecentSessions sessions={recentSessions.data?.data ?? []} />
      </div>

      <BrainLoopPanel />

      <AuditTable events={recentEvents.data?.data ?? []} />
    </div>
  );
}

function StatCard({ data }: { data: StatCardData }) {
  return (
    <div className="border border-border-main p-3 bg-bg-primary min-w-0">
      <div className="text-[11px] font-bold text-text-muted uppercase mb-1 truncate">
        {data.label}
      </div>
      {/* Compact unit (k/m/b) — 853,397,930 → 853.4m. text-3xl mono 는
          어떤 카드 폭에서도 풀 프리시전을 받을 수 없어서 (모바일 ~110px,
          데스크톱 ~270px 에서도 9~10자리 토큰 수가 안 들어옴) 화면
          크기와 무관하게 항상 compact. 풀 값은 title= 로 hover 노출. */}
      <div
        title={formatTokens(data.value)}
        className={cn(
          "text-3xl font-black font-mono tracking-tighter tabular-nums truncate",
          data.accent ? "text-accent" : "text-text-main",
        )}
      >
        {formatTokensCompact(data.value)}
      </div>
      <div className="mt-2 h-1 bg-bg-hover w-full overflow-hidden">
        <div
          className="bg-accent h-full transition-all duration-500"
          style={{ width: `${data.progress}%` }}
        />
      </div>
    </div>
  );
}

function RecentSessions({ sessions }: { sessions: UsageRecentSession[] }) {
  return (
    <div className="border border-border-main flex flex-col bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-3 py-1.5 text-[11px] font-bold uppercase">
        Recent Sessions
      </div>
      <div className="flex-1 p-2 space-y-px overflow-y-auto">
        {sessions.length === 0 && (
          <div className="p-2 text-[11px] font-mono text-text-subtle">
            No sessions recorded yet.
          </div>
        )}
        {sessions.map((session) => {
          const totalTokens =
            session.inputTokens + session.outputTokens + session.cacheReadTokens;
          return (
            <Link
              key={session.sessionId}
              to="/watching/sessions/$sessionId"
              params={{ sessionId: session.sessionId }}
              className="block p-2 border border-border-subtle hover:border-accent hover:bg-bg-hover transition-colors font-mono text-[11px]"
              title={`${session.eventCount} events · last ${formatRelativeTime(session.lastTs)} — click to open the message timeline`}
            >
              <div className="flex justify-between font-bold">
                <span className="uppercase text-text-main truncate">{session.label}</span>
                <span className="text-success">{formatRelativeTime(session.lastTs)}</span>
              </div>
              <div className="flex justify-between text-[10px] text-text-muted mt-1">
                <span className="truncate">{session.model}</span>
                <span>{formatTokensCompact(totalTokens)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const TOKEN_ALERT_THRESHOLD = 100_000;

function AuditTable({ events }: { events: UsageRecentEvent[] }) {
  const money = useMoney();
  return (
    <div className="border border-border-main overflow-hidden bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-3 py-1.5 text-[11px] font-bold uppercase">
        Audit · recent activity
      </div>
      <table className="w-full text-left text-[11px] font-mono">
        <thead className="bg-bg-inverse text-text-on-inverse uppercase">
          <tr>
            <th className="px-3 py-1.5 border-r border-border-subtle">Timestamp</th>
            <th className="px-3 py-1.5 border-r border-border-subtle">Project</th>
            <th className="px-3 py-1.5 border-r border-border-subtle">Model</th>
            <th className="px-3 py-1.5 border-r border-border-subtle">Tokens</th>
            <th className="px-3 py-1.5">Cost</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr>
              <td className="px-3 py-2 text-text-subtle" colSpan={5}>
                No activity recorded yet.
              </td>
            </tr>
          )}
          {events.map((event, i) => {
            const tokens = event.inputTokens + event.outputTokens;
            const alert = tokens >= TOKEN_ALERT_THRESHOLD;
            return (
              <tr
                key={event.messageId}
                className={cn(
                  "border-b border-border-subtle last:border-0 text-text-main",
                  i % 2 === 1 && "bg-bg-zebra",
                )}
              >
                <td className="px-3 py-1.5">{formatLocalTimestamp(event.ts)}</td>
                <td className="px-3 py-1.5 font-bold uppercase truncate max-w-[180px]">
                  {event.label}
                </td>
                <td className="px-3 py-1.5 font-sans font-bold truncate max-w-[160px]">
                  {event.model}
                </td>
                <td className={cn("px-3 py-1.5 tabular-nums", alert && "text-danger font-bold")}>
                  {formatTokensCompact(tokens)}
                </td>
                <td className="px-3 py-1.5 tabular-nums">{money.formatCompact(event.costUsd)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
