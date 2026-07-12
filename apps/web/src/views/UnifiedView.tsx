import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { useMoney } from "@/lib/currency";
import { useApiUnified } from "@/hooks/useUsageApi";

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

/**
 * Phase 5 — Unified view. Joins per-day Local cost (jsonl-derived
 * estimate) with API cost (Anthropic billing). Pure comparison page,
 * no charts of its own — just a table that surfaces the delta and a
 * tiny totals strip up top.
 *
 * If `meta.configured === false` we render the same lock-state as
 * ApiCostView so the user can pick up the missing-key story from
 * either page.
 */
export function UnifiedView() {
  const money = useMoney();
  const [days, setDays] = useState(30);
  const unified = useApiUnified(days);

  const configured = unified.data?.meta.configured ?? true;
  if (configured === false) return <NoKeyView />;

  const rows = unified.data?.data.rows ?? [];
  const totalLocal = rows.reduce((s, r) => s + r.localCostUsd, 0);
  const totalApi = rows.reduce((s, r) => s + r.apiCostUsd, 0);
  const totalDelta = totalApi - totalLocal;

  return (
    <div className="border border-border-main bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-4 py-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase text-text-main">
          Unified · last {days}d
        </span>
        <PeriodToggle days={days} onChange={setDays} />
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Kpi
            label="Local (estimated)"
            value={money.formatCompact(totalLocal)}
            precise={money.format(totalLocal)}
          />
          <Kpi
            label="API (billed)"
            value={money.formatCompact(totalApi)}
            precise={money.format(totalApi)}
            accent
          />
          <Kpi
            label="Delta"
            value={`${totalDelta >= 0 ? "+" : ""}${money.formatCompact(totalDelta)}`}
            precise={`${totalDelta >= 0 ? "+" : ""}${money.format(totalDelta)}`}
            tone={Math.abs(totalDelta) / Math.max(totalApi, 1) > 0.1 ? "warn" : "neutral"}
          />
        </div>

        {rows.length === 0 ? (
          <div className="border border-border-subtle p-6 text-center text-[11px] font-mono text-text-subtle">
            No data to compare yet. Try pressing Refresh on the <Link to="/watching/api" className="underline">API Cost</Link> page.
          </div>
        ) : (
          <DiffTable rows={rows} />
        )}
      </div>
    </div>
  );
}

function NoKeyView() {
  return (
    <div className="border border-border-main bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-4 py-2 text-[11px] font-bold uppercase text-text-main">
        Unified
      </div>
      <div className="p-8 max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <KeyRound size={20} className="text-text-muted shrink-0" />
          <div>
            <div className="text-[14px] font-bold text-text-main">
              Anthropic Admin API key required
            </div>
            <div className="text-[11px] font-mono text-text-muted mt-1">
              Comparing the local estimate against billed costs requires an admin key.
            </div>
          </div>
        </div>
        <Link
          to="/watching/api"
          className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
        >
          <span>See setup instructions on the API Cost page</span>
          <ArrowRight size={12} />
        </Link>
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
  tone = "neutral",
  precise,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "neutral" | "warn";
  precise?: string;
}) {
  const valueClass =
    tone === "warn"
      ? "text-warning"
      : accent
        ? "text-accent"
        : "text-text-main";
  return (
    <div className="border border-border-subtle bg-bg-secondary p-3 min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-widest text-text-muted truncate">
        {label}
      </div>
      <div
        title={precise}
        className={`text-[18px] font-black ${valueClass} mt-1 tabular-nums truncate`}
      >
        {value}
      </div>
    </div>
  );
}

interface UnifiedRow {
  day: string;
  localCostUsd: number;
  apiCostUsd: number;
  deltaUsd: number;
}

function DiffTable({ rows }: { rows: UnifiedRow[] }) {
  const money = useMoney();
  return (
    <div className="border border-border-subtle overflow-hidden">
      <table className="w-full text-[11px] font-mono">
        <thead className="bg-bg-secondary border-b border-border-subtle">
          <tr>
            <th className="text-left px-3 py-2 font-bold uppercase text-text-muted">Day</th>
            <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Local</th>
            <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">API</th>
            <th className="text-right px-3 py-2 font-bold uppercase text-text-muted">Δ</th>
          </tr>
        </thead>
        <tbody>
          {[...rows]
            .sort((a, b) => b.day.localeCompare(a.day))
            .map((r) => {
              // Highlight when API > Local by > 10% — common case for cache
              // miscounting in Local. Highlight other direction subtler.
              const ratio =
                Math.abs(r.deltaUsd) / Math.max(r.apiCostUsd, r.localCostUsd, 1);
              const big = ratio > 0.1;
              return (
                <tr key={r.day} className="border-b border-border-subtle last:border-b-0">
                  <td className="px-3 py-2 text-text-main">{r.day}</td>
                  <td className="px-3 py-2 text-right text-text-muted tabular-nums">
                    {money.format(r.localCostUsd)}
                  </td>
                  <td className="px-3 py-2 text-right text-text-main tabular-nums font-bold">
                    {money.format(r.apiCostUsd)}
                  </td>
                  <td
                    className={
                      big
                        ? "px-3 py-2 text-right tabular-nums font-bold text-warning"
                        : "px-3 py-2 text-right tabular-nums text-text-muted"
                    }
                  >
                    {r.deltaUsd >= 0 ? "+" : ""}
                    {money.format(r.deltaUsd)}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
