import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, KeyRound, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  UsageBarChart,
  UsageDonutChart,
} from "@/components/charts";
import { formatTokens, formatTokensCompact } from "@/lib/format/tokens";
import { useMoney } from "@/lib/currency";
import { formatRelativeTime } from "@/lib/format/datetime";
import {
  useApiByDay,
  useApiByModel,
  useApiSummary,
  useRefreshApi,
} from "@/hooks/useUsageApi";

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

/**
 * Phase 5 — Anthropic Admin API view. Mirrors `LocalUsageView`'s
 * layout so the user can compare the two pages without re-learning
 * controls. The big difference is the lock-state: when the server has
 * no `ANTHROPIC_ADMIN_KEY`, every endpoint sets `meta.configured=false`
 * and we render an explicit "set the key" panel instead of a noisy
 * dashboard with all-zero numbers.
 */
export function ApiCostView() {
  const money = useMoney();
  const [days, setDays] = useState(30);
  const summary = useApiSummary(days);
  const byDay = useApiByDay(days);
  const byModel = useApiByModel(days);
  const refresh = useRefreshApi();

  const configured = summary.data?.meta.configured ?? true;
  const fetchedAt = summary.data?.meta.fetchedAt ?? null;

  if (configured === false) {
    return <NoKeyView />;
  }

  const onRefresh = () => {
    refresh.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          `Fetched ${r.data.usageBuckets} usage / ${r.data.costBuckets} cost buckets`,
        ),
      onError: (err) => toast.error("Refresh failed", { description: err.message }),
    });
  };

  const sumData = summary.data?.data;
  const totalEvents = summary.data?.meta.totalEvents ?? 0;

  return (
    <div className="border border-border-main bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[11px] font-bold uppercase text-text-main">
            API Cost · last {days}d
          </span>
          {fetchedAt !== null && (
            <span className="text-[10px] font-mono text-text-subtle">
              cache · {formatRelativeTime(fetchedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PeriodToggle days={days} onChange={setDays} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={refresh.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors disabled:cursor-wait"
          >
            <RefreshCw size={12} className={refresh.isPending ? "animate-spin" : ""} />
            <span>{refresh.isPending ? "Fetching…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            label="Total Cost"
            value={sumData ? money.formatCompact(sumData.costUsd) : "…"}
            precise={sumData ? money.format(sumData.costUsd) : undefined}
            accent
          />
          <Kpi
            label="Input Tokens"
            value={sumData ? formatTokensCompact(sumData.inputTokens) : "…"}
            precise={sumData ? formatTokens(sumData.inputTokens) : undefined}
          />
          <Kpi
            label="Output Tokens"
            value={sumData ? formatTokensCompact(sumData.outputTokens) : "…"}
            precise={sumData ? formatTokens(sumData.outputTokens) : undefined}
          />
          <Kpi
            label="Buckets"
            value={formatTokensCompact(totalEvents)}
            precise={totalEvents.toLocaleString("en-US")}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 border border-border-subtle p-3">
            <SectionLabel>Daily cost</SectionLabel>
            <UsageBarChart
              data={(byDay.data?.data ?? []).map((r) => ({
                label: r.day.slice(5),
                costUsd: r.costUsd,
              }))}
            />
          </div>
          <div className="border border-border-subtle p-3">
            <SectionLabel>By model · cost</SectionLabel>
            <UsageDonutChart
              data={(byModel.data?.data ?? []).map((r) => ({
                label: r.model,
                costUsd: r.costUsd,
              }))}
            />
          </div>
        </div>

        <div className="border border-border-subtle">
          <SectionLabel className="px-3 pt-3">Models · cost detail</SectionLabel>
          <ModelTable rows={byModel.data?.data ?? []} />
        </div>
      </div>
    </div>
  );
}

function NoKeyView() {
  return (
    <div className="border border-border-main bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-4 py-2 text-[11px] font-bold uppercase text-text-main">
        API Cost
      </div>
      <div className="p-8 max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <KeyRound size={20} className="text-text-muted shrink-0" />
          <div>
            <div className="text-[14px] font-bold text-text-main">
              No Anthropic Admin API key configured
            </div>
            <div className="text-[11px] font-mono text-text-muted mt-1">
              Viewing real billing data requires organization admin credentials.
            </div>
          </div>
        </div>

        <div className="border border-border-subtle bg-bg-secondary p-4 text-[11px] font-mono text-text-main leading-relaxed">
          <div className="font-bold uppercase text-text-muted text-[10px] mb-2">
            How to set it up
          </div>
          <ol className="list-decimal pl-4 space-y-2">
            <li>
              <a
                href="https://console.anthropic.com/settings/admin-keys"
                target="_blank"
                rel="noreferrer"
                className="underline text-accent inline-flex items-center gap-1"
              >
                Anthropic Console → Admin API <ExternalLink size={10} />
              </a>{" "}
              to issue a key (<code>sk-ant-admin-...</code>)
            </li>
            <li>
              <code>apps/server/.env.local</code> add:
              <pre className="bg-bg-primary border border-border-subtle p-2 mt-1 text-[10px] overflow-x-auto">
                ANTHROPIC_ADMIN_KEY=sk-ant-admin-...
              </pre>
            </li>
            <li>
              Restart the server (<code>sh scripts/launch.sh</code>), then hit{" "}
              <span className="font-bold">Refresh</span> on this page
            </li>
          </ol>
        </div>

        <div className="border border-border-subtle bg-bg-secondary p-4 text-[11px] font-mono text-text-muted leading-relaxed">
          <div className="font-bold uppercase text-text-muted text-[10px] mb-2">
            If you're on a Pro subscription
          </div>
          A flat-rate Pro subscription can't issue an admin key at all (no usage-based billing). In that case,{" "}
          <Link to="/watching/local" className="underline text-text-main">
            Local Usage
          </Link>{" "}
          page's jsonl-based estimate is effectively the full picture — cache hit ratio, model breakdown, time-of-day, etc. all still apply.
        </div>
      </div>
    </div>
  );
}

function PeriodToggle({
  days,
  onChange,
}: {
  days: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="inline-flex border border-border-main">
      {PERIODS.map((p) => {
        const active = p.days === days;
        return (
          <button
            key={p.days}
            type="button"
            onClick={() => onChange(p.days)}
            className={
              active
                ? "px-2 py-1 text-[10px] font-bold uppercase bg-accent text-text-on-accent"
                : "px-2 py-1 text-[10px] font-bold uppercase bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
            }
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  precise,
}: {
  label: string;
  value: string;
  accent?: boolean;
  precise?: string;
}) {
  return (
    <div className="border border-border-subtle bg-bg-secondary p-3 min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-widest text-text-muted truncate">
        {label}
      </div>
      <div
        title={precise}
        className={
          accent
            ? "text-[18px] font-black text-accent mt-1 tabular-nums truncate"
            : "text-[18px] font-black text-text-main mt-1 tabular-nums truncate"
        }
      >
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function ModelTable({
  rows,
}: {
  rows: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    count: number;
  }>;
}) {
  const money = useMoney();
  if (rows.length === 0) {
    return (
      <div className="px-3 py-4 text-[11px] font-mono text-text-subtle">
        No per-model data yet. Try pressing Refresh.
      </div>
    );
  }
  return (
    <table className="w-full text-[11px] font-mono">
      <thead className="bg-bg-secondary border-b border-border-subtle">
        <tr>
          <th className="text-left px-3 py-2 font-bold uppercase text-text-muted">Model</th>
          <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Buckets</th>
          <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Input</th>
          <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Output</th>
          <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Cache R</th>
          <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.model} className="border-b border-border-subtle last:border-b-0">
            <td className="px-3 py-2 text-text-main">{r.model || "(unspecified)"}</td>
            <td className="px-3 py-2 text-right text-text-muted tabular-nums">
              {r.count.toLocaleString("en-US")}
            </td>
            <td className="px-3 py-2 text-right text-text-muted tabular-nums">
              {formatTokens(r.inputTokens)}
            </td>
            <td className="px-3 py-2 text-right text-text-muted tabular-nums">
              {formatTokens(r.outputTokens)}
            </td>
            <td className="px-3 py-2 text-right text-text-muted tabular-nums">
              {formatTokens(r.cacheReadTokens)}
            </td>
            <td className="px-3 py-2 text-right text-text-main tabular-nums font-bold">
              {money.format(r.costUsd)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

