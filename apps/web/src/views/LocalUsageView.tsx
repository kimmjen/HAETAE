import { useState } from "react";
import dayjs from "@/lib/dayjs";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv, downloadJson } from "@/lib/export";
import {
  UsageAreaChart,
  UsageBarChart,
  UsageDonutChart,
  UsageHeatmap,
} from "@/components/charts";
import { CacheInsightsPanel } from "@/components/CacheInsightsPanel";
import { formatTokens, formatTokensCompact } from "@/lib/format/tokens";
import { useMoney } from "@/lib/currency";
import {
  useRefreshUsage,
  useUsageByDay,
  useUsageByModel,
  useUsageByProject,
  useUsageHeatmap,
  useUsageInsights,
  useUsageSummary,
} from "@/hooks/useUsageLocal";

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

/**
 * Phase 4 main analytics page. Live data from /api/usage/local/* with a
 * period toggle (7/30/90 days) and a manual refresh button — no polling
 * because Claude Code only writes during active sessions.
 *
 * Layout: KPI strip → daily area + model donut row → project bar +
 * heatmap row → model details table. Each block degrades to its
 * chart's empty state when there's no data in the chosen window.
 */
export function LocalUsageView() {
  const money = useMoney();
  const [days, setDays] = useState(30);
  const summary = useUsageSummary(days);
  const byDay = useUsageByDay(days);
  const byModel = useUsageByModel(days);
  const byProject = useUsageByProject(days);
  const heatmap = useUsageHeatmap(days);
  const insights = useUsageInsights(days);
  const refresh = useRefreshUsage();

  const onRefresh = () => {
    refresh.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          `Indexed ${r.data.filesScanned} file${r.data.filesScanned === 1 ? "" : "s"} (+${r.data.totalInserted} new events)`,
        ),
      onError: (err) => toast.error("Refresh failed", { description: err.message }),
    });
  };

  const sumData = summary.data?.data;
  const totalEvents = summary.data?.meta.totalEvents ?? 0;

  return (
    <div className="border border-border-main bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-4 py-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase text-text-main">
          Local Usage · last {days}d
        </span>
        <div className="flex items-center gap-2">
          <PeriodToggle days={days} onChange={setDays} />
          <ExportMenu
            days={days}
            byDay={byDay.data?.data ?? []}
            byModel={byModel.data?.data ?? []}
            byProject={byProject.data?.data ?? []}
            summary={sumData}
          />
          <button
            type="button"
            onClick={onRefresh}
            disabled={refresh.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors disabled:cursor-wait"
          >
            <RefreshCw size={12} className={refresh.isPending ? "animate-spin" : ""} />
            <span>{refresh.isPending ? "Indexing…" : "Refresh"}</span>
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
            label="Events"
            value={formatTokensCompact(totalEvents)}
            precise={totalEvents.toLocaleString("en-US")}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 border border-border-subtle p-3">
            <SectionLabel>Daily tokens</SectionLabel>
            <UsageAreaChart data={byDay.data?.data ?? []} />
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="border border-border-subtle p-3">
            <SectionLabel>By project · cost (top 10)</SectionLabel>
            <UsageBarChart
              topN={10}
              data={(byProject.data?.data ?? []).map((r) => ({
                label: r.label,
                costUsd: r.costUsd,
              }))}
            />
          </div>
          <div className="border border-border-subtle p-3">
            <SectionLabel>Activity heatmap (day × hour, local time)</SectionLabel>
            <UsageHeatmap cells={heatmap.data?.data.cells ?? []} />
          </div>
        </div>

        <CacheInsightsPanel data={insights.data?.data} />

        <div className="border border-border-subtle">
          <SectionLabel className="px-3 pt-3">Models</SectionLabel>
          <ModelTable rows={byModel.data?.data ?? []} />
        </div>
      </div>
    </div>
  );
}

interface ExportMenuProps {
  days: number;
  byDay: ReadonlyArray<object>;
  byModel: ReadonlyArray<object>;
  byProject: ReadonlyArray<object>;
  summary: object | undefined;
}

function ExportMenu({ days, byDay, byModel, byProject, summary }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const now = dayjs();
  const stamp = `${days}d-${now.format("YYYY-MM-DD")}`;

  const exportJson = () => {
    downloadJson(`haetae-local-${stamp}.json`, {
      asOf: now.toISOString(),
      days,
      summary: summary ?? null,
      byDay,
      byModel,
      byProject,
    });
    setOpen(false);
  };
  const exportCsv = (kind: "by-day" | "by-model" | "by-project") => {
    const rows =
      kind === "by-day" ? byDay : kind === "by-model" ? byModel : byProject;
    if (rows.length === 0) {
      toast.error("No data to export");
      return;
    }
    downloadCsv(`haetae-local-${kind}-${stamp}.csv`, rows);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
      >
        <Download size={12} />
        <span>Export</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close export menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-50 min-w-[160px] bg-bg-elevated border border-border-main shadow-md py-1"
          >
            <ExportItem label="JSON · all" onClick={exportJson} />
            <ExportItem label="CSV · by-day" onClick={() => exportCsv("by-day")} />
            <ExportItem label="CSV · by-model" onClick={() => exportCsv("by-model")} />
            <ExportItem label="CSV · by-project" onClick={() => exportCsv("by-project")} />
          </div>
        </>
      )}
    </div>
  );
}

function ExportItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full text-left px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-main hover:bg-bg-hover transition-colors"
    >
      {label}
    </button>
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
  /** Full-precision value surfaced via `title=` (hover / long-press) so
      the compact card display doesn't hide exact numbers. */
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
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    count: number;
  }>;
}) {
  const money = useMoney();
  if (rows.length === 0) {
    return (
      <div className="px-3 py-4 text-[11px] font-mono text-text-subtle">
        No per-model data yet.
      </div>
    );
  }
  return (
    <table className="w-full text-[11px] font-mono">
      <thead className="bg-bg-secondary border-b border-border-subtle">
        <tr>
          <th className="text-left px-3 py-2 font-bold uppercase text-text-muted">Model</th>
          <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Events</th>
          <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Input</th>
          <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Output</th>
          <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Cache R</th>
          <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.model} className="border-b border-border-subtle last:border-b-0">
            <td className="px-3 py-2 text-text-main">{r.model}</td>
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
