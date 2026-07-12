import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import {
  useSessionsList,
  useActiveSessions,
  useUsageByProject,
  type SessionListRow,
} from "@/hooks/useUsageLocal";
import { formatRelativeTime } from "@/lib/format/datetime";
import { formatTokensCompact } from "@/lib/format/tokens";
import { useMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

export function SessionsListView() {
  const [days, setDays] = useState<number>(30);
  const [projectFilter, setProjectFilter] = useState<string>("");

  const sessionsQ = useSessionsList({ days, projectPath: projectFilter || undefined, limit: 100 });
  const activeQ = useActiveSessions();
  const byProjectQ = useUsageByProject(days);

  const rows: SessionListRow[] = sessionsQ.data?.data ?? [];
  const activeIds = new Set(activeQ.data?.data.sessionIds ?? []);
  const projects = byProjectQ.data?.data?.map((p) => ({ path: p.projectPath, label: p.label })) ?? [];
  const liveCount = rows.filter((r) => activeIds.has(r.sessionId)).length;

  return (
    <div className="space-y-3">
      <div className="border border-border-main bg-bg-secondary px-3 py-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-text-main">
          <History size={12} className="text-text-muted" />
          Sessions
          {liveCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase bg-green-500/20 text-green-500 border border-green-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {liveCount} Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 ml-auto flex-wrap">
          <div className="flex border border-border-main">
            {PERIOD_OPTIONS.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setDays(o.days)}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-bold uppercase transition-colors",
                  days === o.days
                    ? "bg-accent text-text-on-accent"
                    : "bg-bg-primary text-text-muted hover:bg-bg-hover",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="border border-border-main bg-bg-primary text-[10px] font-mono text-text-main px-2 py-0.5 h-[22px]"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border border-border-main bg-bg-primary">
        {sessionsQ.isPending && (
          <div className="px-4 py-8 text-[11px] font-mono text-text-muted">Loading…</div>
        )}
        {sessionsQ.isError && (
          <div className="px-4 py-8 text-[11px] font-mono text-danger">
            Failed to load the session list.
          </div>
        )}
        {!sessionsQ.isPending && rows.length === 0 && (
          <div className="px-4 py-8 text-[11px] font-mono text-text-subtle">
            No sessions recorded in this period.
          </div>
        )}
        {rows.length > 0 && (
          <div className="divide-y divide-border-subtle">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1.5 bg-bg-secondary border-b border-border-main text-[9px] font-bold uppercase tracking-widest text-text-muted">
              <span>Session</span>
              <span className="text-right">Tokens</span>
              <span className="text-right">Cost</span>
              <span className="text-right">When</span>
            </div>
            {rows.map((s) => (
              <SessionRow key={s.sessionId} session={s} isLive={activeIds.has(s.sessionId)} />
            ))}
          </div>
        )}
      </div>

      <div className="text-[10px] font-mono text-text-subtle px-1">
        {rows.length} sessions · last {days}d
        {sessionsQ.data?.meta.totalEvents != null &&
          ` · ${sessionsQ.data.meta.totalEvents} total`}
      </div>
    </div>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-px text-[9px] font-bold uppercase text-green-500 border border-green-500/40 bg-green-500/10 shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      Live
    </span>
  );
}

function SessionRow({ session: s, isLive }: { session: SessionListRow; isLive: boolean }) {
  const money = useMoney();
  return (
    <Link
      to="/watching/sessions/$sessionId"
      params={{ sessionId: s.sessionId }}
      className={cn(
        "grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2.5 hover:bg-bg-hover transition-colors group items-start",
        isLive && "bg-green-500/5",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-text-main font-bold truncate">
            {s.sessionId.slice(0, 8)}&hellip;
          </span>
          {isLive && <LiveBadge />}
        </div>
        <div className="font-mono text-[10px] text-text-muted truncate mt-0.5">
          {s.label} · {s.model.replace(/^claude-/, "")}
        </div>
      </div>
      <div className="text-right font-mono text-[11px] text-text-muted tabular-nums whitespace-nowrap self-center">
        {formatTokensCompact(s.inputTokens + s.outputTokens)}
      </div>
      <div className="text-right font-mono text-[11px] text-accent font-bold tabular-nums whitespace-nowrap self-center">
        {money.formatCompact(s.costUsd)}
      </div>
      <div className="text-right font-mono text-[10px] text-text-subtle whitespace-nowrap self-center">
        {formatRelativeTime(s.lastTs)}
      </div>
    </Link>
  );
}
