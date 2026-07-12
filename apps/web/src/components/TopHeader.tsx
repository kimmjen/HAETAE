import { Menu, RotateCw, User } from "lucide-react";
import { formatPercent, formatTokens, formatTokensCompact } from "@/lib/format";
import { useRefreshUsage, useUsageByDay } from "@/hooks/useUsageLocal";
import { useRefreshUsageLimits } from "@/hooks/useUsageLimits";
import { useMoney } from "@/lib/currency";
import { ThemeToggle } from "./ThemeToggle";
import { CurrencyToggle } from "./CurrencyToggle";

interface TopHeaderProps {
  title: string;
  onProfileClick: () => void;
  /** Mobile nav trigger. Required prop in practice; optional for tests
      that mount TopHeader in isolation without the shell state. */
  onMenuClick?: () => void;
}

/**
 * Always-visible header strip. The two metric blocks
 * (TOKENS.TODAY / COST.DAILY) read off the local usage_events table —
 * same data plane as the Watching pages, so a single Refresh hits
 * everything at once.
 *
 * SYNC button is wired to `useRefreshUsage` (the Local Usage page's
 * indexer mutation) with a spinning state during the indexer pass.
 */
export function TopHeader({ title, onProfileClick, onMenuClick }: TopHeaderProps) {
  // Pull two days so we can compute today vs yesterday delta.
  const byDay = useUsageByDay(2);
  const refresh = useRefreshUsage();
  // SYNC also force-refreshes the OAuth usage limits — otherwise the Rolling
  // Windows 5h/7d % sits behind a 5min server cache + 5min client poll and
  // reads as "not updating" while everything else moves.
  const refreshLimits = useRefreshUsageLimits();
  const money = useMoney();
  const syncing = refresh.isPending || refreshLimits.isPending;

  const days = byDay.data?.data ?? [];
  const today = days[days.length - 1];
  const prior = days.length >= 2 ? days[days.length - 2] : undefined;

  const tokensToday =
    (today?.inputTokens ?? 0) +
    (today?.outputTokens ?? 0) +
    (today?.cacheReadTokens ?? 0);
  const costDaily = today?.costUsd ?? 0;
  const priorTokens = prior
    ? prior.inputTokens + prior.outputTokens + prior.cacheReadTokens
    : 0;
  const tokensDelta =
    priorTokens > 0 ? (tokensToday - priorTokens) / priorTokens : 0;
  const deltaUp = tokensDelta >= 0;

  return (
    <header className="h-12 border-b border-border-main bg-bg-secondary flex items-center justify-between px-3 sm:px-4 shrink-0 gap-2">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation"
            className="lg:hidden p-1.5 -ml-1 border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
          >
            <Menu size={14} />
          </button>
        )}
        <h1 className="text-[14px] font-black tracking-tighter uppercase text-text-main truncate">
          {title}
        </h1>
        {/* SYS.READY chip — chrome-only signal, drop it on phones to
            reclaim space; back at sm (640px) tablets and up. */}
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono font-bold text-text-muted border-l border-border-main pl-4">
          <span className="w-2 h-2 rounded-full bg-success" />
          SYS.READY
        </div>
      </div>

      {/* Metric strip — hidden below md, visible md+ where there's room.
          숫자는 compact 로 (예: 14.2k / $1.2k), 풀 프리시전은 title=
          으로 hover 노출. 큰 일일 사용량에도 헤더가 안 흔들림. */}
      <div className="hidden md:flex items-center gap-6 text-[11px] font-mono">
        <div className="flex space-x-3">
          <span className="text-text-muted uppercase">TOKENS.TODAY</span>
          <span
            title={formatTokens(tokensToday)}
            className="font-bold tabular-nums text-text-main"
          >
            {formatTokensCompact(tokensToday)}
          </span>
          {prior !== undefined && (
            <span
              className={
                deltaUp ? "text-success font-bold font-sans" : "text-danger font-bold font-sans"
              }
            >
              {`${deltaUp ? "▲" : "▼"} ${formatPercent(Math.abs(tokensDelta))}`}
            </span>
          )}
        </div>
        <div className="flex space-x-3">
          <span className="text-text-muted uppercase">COST.DAILY</span>
          <span
            title={money.format(costDaily)}
            className="font-bold text-accent tabular-nums"
          >
            {money.formatCompact(costDaily)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            refresh.mutate();
            refreshLimits.mutate();
          }}
          disabled={syncing}
          aria-label="Refresh local usage index and usage limits"
          title="re-index ~/.claude/projects/**/*.jsonl + refresh usage limits"
          className="flex items-center gap-2 px-2 py-1 text-[10px] font-bold border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors disabled:cursor-wait disabled:text-text-subtle"
        >
          <RotateCw size={12} className={syncing ? "animate-spin" : ""} />
          <span>{syncing ? "SYNCING" : "SYNC"}</span>
        </button>
        <CurrencyToggle />
        <ThemeToggle />
        <button
          type="button"
          onClick={onProfileClick}
          aria-label="Open profile"
          className="p-1.5 border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
        >
          <User size={14} />
        </button>
      </div>
    </header>
  );
}
