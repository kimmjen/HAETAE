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
import { paletteAt } from "./colors";
import { ChartEmptyState } from "./EmptyState";
import { toNum } from "./internal";

export interface UsageBarPoint {
  /** Display label on the X axis (basename, model id, ...). */
  label: string;
  /** Cost in USD for this category. */
  costUsd: number;
}

interface UsageBarChartProps {
  data: UsageBarPoint[];
  height?: number;
  /** Cap rendering to top-N (sorted by cost, descending). */
  topN?: number;
}

/**
 * Horizontal-axis bar chart for cost-by-category. Categories cycle
 * through the Bloomberg accent palette so multiple bars stay visually
 * distinct without legend lookups.
 */
export function UsageBarChart({ data, height = 240, topN }: UsageBarChartProps) {
  const money = useMoney();
  const sorted = [...data].sort((a, b) => b.costUsd - a.costUsd);
  const sliced = topN === undefined ? sorted : sorted.slice(0, topN);

  if (sliced.length === 0) {
    return (
      <div style={{ height }}>
        <ChartEmptyState message="No cost data yet" />
      </div>
    );
  }
  return (
    <div style={{ height }} data-testid="usage-bar-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sliced} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border-subtle)" strokeDasharray="2 2" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
            stroke="var(--color-border-subtle)"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
            stroke="var(--color-border-subtle)"
            // 축은 compact 로 ($1.2k), Tooltip 이 풀 값. 좁은 폭에서
            // plot 영역 잠식 방지 + 5자리 + 센트가 겹치던 문제 해소.
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
          />
          <Bar dataKey="costUsd" name="Cost">
            {sliced.map((_, i) => (
              <Cell key={i} fill={paletteAt(i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
