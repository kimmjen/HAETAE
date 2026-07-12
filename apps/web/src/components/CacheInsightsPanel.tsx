import { formatTokens } from "@/lib/format/tokens";
import { useMoney } from "@/lib/currency";
import type { UsageInsights } from "@/hooks/useUsageLocal";

interface CacheInsightsPanelProps {
  data: UsageInsights | undefined;
}

/**
 * Phase 6.1 — cache efficiency. Three blocks:
 *
 *   1. Headline KPI (overall hit ratio + total savings vs paying full
 *      input rate)
 *   2. Per-model mini table sorted by savings — surfaces which model
 *      benefits most from caching
 *   3. Per-project mini table — same intent, different cut
 *
 * Lives inside `LocalUsageView`. Bloomberg-tone tables matching the
 * model details table further down the page.
 */
export function CacheInsightsPanel({ data }: CacheInsightsPanelProps) {
  const money = useMoney();
  if (!data) {
    return (
      <div className="border border-border-subtle p-3 text-[11px] font-mono text-text-subtle">
        loading insights…
      </div>
    );
  }
  const ratio = data.hitRatio;
  const ratioClass =
    ratio >= 0.7
      ? "text-success"
      : ratio >= 0.4
        ? "text-warning"
        : "text-text-main";

  return (
    <div className="border border-border-subtle">
      <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted px-3 pt-3">
        Cache efficiency · last {data.days}d
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3">
        <Stat
          label="Hit ratio"
          value={`${(ratio * 100).toFixed(1)}%`}
          valueClass={ratioClass}
        />
        <Stat
          label="Cache read tokens"
          value={formatTokens(data.cacheReadTokens)}
        />
        <Stat
          label="Savings vs full input"
          value={money.format(data.cacheSavingsUsd)}
          valueClass="text-accent"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 px-3 pb-3">
        <ModelTable rows={data.perModel} />
        <ProjectTable rows={data.perProject} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="border border-border-subtle bg-bg-secondary p-2">
      <div className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
        {label}
      </div>
      <div
        className={`text-[18px] font-black mt-1 tabular-nums ${valueClass ?? "text-text-main"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ModelTable({ rows }: { rows: UsageInsights["perModel"] }) {
  const money = useMoney();
  if (rows.length === 0) {
    return (
      <div className="border border-border-subtle p-3 text-[10px] font-mono text-text-subtle">
        no model data yet.
      </div>
    );
  }
  return (
    <div className="border border-border-subtle">
      <div className="bg-bg-secondary border-b border-border-subtle px-2 py-1 text-[9px] font-bold uppercase text-text-muted">
        Top by savings — models
      </div>
      <table className="w-full text-[10px] font-mono">
        <tbody>
          {rows.slice(0, 5).map((r) => (
            <tr key={r.model} className="border-b border-border-subtle last:border-b-0">
              <td className="px-2 py-1 text-text-main truncate max-w-[180px]">
                {r.model || "(unknown)"}
              </td>
              <td className="px-2 py-1 text-right text-text-muted tabular-nums">
                {(r.hitRatio * 100).toFixed(0)}%
              </td>
              <td className="px-2 py-1 text-right text-text-main tabular-nums font-bold">
                {money.format(r.savingsUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectTable({ rows }: { rows: UsageInsights["perProject"] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-border-subtle p-3 text-[10px] font-mono text-text-subtle">
        no project data yet.
      </div>
    );
  }
  return (
    <div className="border border-border-subtle">
      <div className="bg-bg-secondary border-b border-border-subtle px-2 py-1 text-[9px] font-bold uppercase text-text-muted">
        Top cache readers — projects
      </div>
      <table className="w-full text-[10px] font-mono">
        <tbody>
          {rows.slice(0, 5).map((r) => (
            <tr
              key={r.projectPath}
              className="border-b border-border-subtle last:border-b-0"
            >
              <td className="px-2 py-1 text-text-main font-bold uppercase truncate max-w-[160px]">
                {r.label}
              </td>
              <td className="px-2 py-1 text-right text-text-muted tabular-nums">
                {(r.hitRatio * 100).toFixed(0)}%
              </td>
              <td className="px-2 py-1 text-right text-text-muted tabular-nums">
                {formatTokens(r.cacheReadTokens)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
