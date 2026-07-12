import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMoney } from "@/lib/currency";
import { toNum } from "@/components/charts/internal";
import type { UsageDayPoint } from "@/hooks/useUsageLocal";

interface OverviewTrendProps {
  data: UsageDayPoint[];
}

const TREND_BARS = 14;

/**
 * Daily-cost trend block on the Overview page. A Recharts BarChart so
 * tooltip + axis labels make the cost values immediately legible — the
 * earlier height-only Bloomberg bars looked the part but hid the
 * numbers behind native title attributes which barely surfaced.
 *
 * Color comes from the same Bloomberg ANSI tokens as elsewhere
 * (`--color-accent`, peak only `--color-danger`), so visual tone stays
 * consistent with the rest of the page.
 */
export function OverviewTrend({ data }: OverviewTrendProps) {
  const money = useMoney();
  const tail = data.slice(-TREND_BARS);
  const peak = tail.reduce((m, d) => Math.max(m, d.costUsd), 0);
  const avg = tail.length > 0 ? tail.reduce((s, d) => s + d.costUsd, 0) / tail.length : 0;

  return (
    <div className="col-span-2 border border-border-main flex flex-col bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-3 py-1.5 flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase">
          Usage Trend · cost (last {tail.length || TREND_BARS}d)
        </span>
        {tail.length > 0 && (
          <span
            className="text-[10px] font-mono text-text-muted normal-case truncate"
            title={`peak ${money.format(peak)} · avg ${money.format(avg)}`}
          >
            peak {money.formatCompact(peak)} · avg {money.formatCompact(avg)}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-[300px] p-3" data-testid="overview-trend-chart">
        {tail.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[11px] font-mono text-text-subtle">
            No usage recorded yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tail} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border-subtle)" strokeDasharray="2 2" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                stroke="var(--color-border-subtle)"
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                stroke="var(--color-border-subtle)"
                // 축은 compact, Tooltip 이 풀 값.
                tickFormatter={(v: number) => money.formatCompact(v)}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border-main)",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                }}
                formatter={(v) => money.format(toNum(v))}
                labelFormatter={(label) => String(label ?? "")}
              />
              <Bar dataKey="costUsd" name="Cost" fill="var(--color-accent)">
                {tail.map((d) => (
                  <Cell
                    key={d.day}
                    fill={d.costUsd === peak ? "var(--color-danger)" : "var(--color-accent)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
