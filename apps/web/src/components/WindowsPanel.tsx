import { useEffect, useState } from "react";
import { useUsageWindows, type UsageWindowBucket } from "@/hooks/useUsageLocal";
import { useThresholdStatus } from "@/hooks/useThresholds";
import { useUsageLimits } from "@/hooks/useUsageLimits";
import { useMoney } from "@/lib/currency";
import { formatTokensCompact } from "@/lib/format/tokens";
import { formatRelativeTime } from "@/lib/format/datetime";
import dayjs from "@/lib/dayjs";

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => dayjs().valueOf());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs().valueOf()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Rolling-window 누적 패널. 5시간 / 7일 진짜 한도 % 는 Claude CLI 의
 * 비공식 `/api/oauth/usage` 엔드포인트에서 가져와 우선 표시. 그 데이터
 * 가 없으면 (OAuth 만료, 비-mac OS, 혹은 schema 변경) 사용자가 입력한
 * 임계치 (#153) 대비 % 로 fallback.
 *
 * 24h / month 셀은 CLI 가 노출 안 하므로 항상 우리 jsonl + 사용자 임계치.
 *
 * 데이터 소스 근거: docs/research/claude-code-data-sources.md.
 */
export function WindowsPanel() {
  const q = useUsageWindows();
  const limits = useUsageLimits();
  const status = useThresholdStatus();
  const now = useNow();

  const data = q.data?.data;
  const live = limits.data?.data;

  const cells = [
    {
      label: "Last 5h",
      bucket: data?.windows.last5h,
      livePct: live?.fiveHour?.utilization ?? null,
      liveResetAt: live?.fiveHour?.resetsAt ?? null,
      limit: status.thresholds.fiveHourUsd,
      over: status.fiveHourOver,
      accent: true,
    },
    {
      label: "Last 24h",
      bucket: data?.windows.last24h,
      livePct: null,
      liveResetAt: null,
      limit: status.thresholds.dailyUsd,
      over: status.dailyOver,
    },
    {
      label: "Last 7d",
      bucket: data?.windows.last7d,
      livePct: live?.sevenDay?.utilization ?? null,
      liveResetAt: live?.sevenDay?.resetsAt ?? null,
      limit: status.thresholds.weeklyUsd,
      over: status.weeklyOver,
    },
    {
      label: "This month",
      bucket: data?.windows.monthToDate,
      livePct: null,
      liveResetAt: null,
      limit: status.thresholds.monthlyUsd,
      over: status.monthlyOver,
    },
  ];

  return (
    <div className="border border-border-main bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-3 py-1.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase text-text-main">
          Rolling Windows
        </span>
        <span className="text-[10px] font-mono text-text-muted">
          {live ? "limit · claude /config" : "limit · Settings threshold"}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border-subtle">
        {cells.map((c) => (
          <Cell key={c.label} {...c} now={now} />
        ))}
      </div>
    </div>
  );
}

interface CellProps {
  label: string;
  bucket: UsageWindowBucket | undefined;
  livePct: number | null;
  liveResetAt: string | null;
  limit: number | null;
  over: boolean;
  accent?: boolean;
  now: number;
}

function Cell({ label, bucket, livePct, liveResetAt, limit, over, accent, now }: CellProps) {
  const money = useMoney();
  const cost = bucket?.costUsd ?? 0;
  const pct =
    livePct !== null
      ? Math.min(100, livePct)
      : limit && limit > 0
        ? Math.min(100, (cost / limit) * 100)
        : null;
  const overEffective = livePct !== null ? livePct >= 100 : over;
  const valueClass = overEffective ? "text-danger" : accent ? "text-accent" : "text-text-main";

  const resetMs = liveResetAt ? dayjs(liveResetAt).valueOf() : NaN;
  const hasReset = Number.isFinite(resetMs) && resetMs > 0;

  return (
    <div className="px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
          {label}
        </div>
        {livePct !== null ? (
          <div className="text-[9px] font-mono text-text-subtle tabular-nums">
            {livePct.toFixed(0)}%
          </div>
        ) : limit !== null ? (
          <div className="text-[9px] font-mono text-text-subtle tabular-nums">
            / {money.format(limit)}
          </div>
        ) : null}
      </div>
      <div className={`text-[18px] font-black tabular-nums mt-1 ${valueClass}`}>
        {bucket ? money.format(cost) : "…"}
      </div>
      <div className="text-[10px] font-mono text-text-muted mt-0.5">
        {bucket
          ? `${bucket.count.toLocaleString("en-US")} msgs · ${formatTokensCompact(
              bucket.inputTokens + bucket.outputTokens,
            )} tok`
          : "…"}
      </div>
      <ProgressBar pct={pct} over={overEffective} accent={accent} />
      {hasReset && (
        <div className="text-[10px] font-mono text-text-subtle mt-1 truncate">
          resets · {formatRelativeTime(resetMs, now)}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ pct, over, accent }: { pct: number | null; over: boolean; accent?: boolean }) {
  if (pct === null) {
    return (
      <div
        className="mt-2 h-1 bg-bg-hover w-full"
        title="No limit/threshold set — fills in after Settings or claude login"
      />
    );
  }
  const fillClass = over ? "bg-danger" : accent ? "bg-accent" : "bg-accent";
  return (
    <div className="mt-2 h-1 bg-bg-hover w-full overflow-hidden" title={`${pct.toFixed(0)}% of limit`}>
      <div className={`h-full transition-all duration-300 ${fillClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
