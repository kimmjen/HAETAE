import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useMoney } from "@/lib/currency";
import { paletteAt } from "./colors";
import { ChartEmptyState } from "./EmptyState";
import { toNum } from "./internal";

export interface UsageDonutSlice {
  label: string;
  costUsd: number;
}

interface UsageDonutChartProps {
  data: UsageDonutSlice[];
  height?: number;
  /** Inner radius (px). Higher = thinner ring. Default 56. */
  innerRadius?: number;
  /** Outer radius (px). Default 84. */
  outerRadius?: number;
}

/**
 * Donut chart for cost distribution across categories (typically models).
 * Slices are coloured from the same Bloomberg palette as the bar chart so
 * a single page using both charts stays visually consistent.
 *
 * The center of the donut is left empty by design — usage pages overlay
 * a separate KPI block (total cost, total events) on top of it via the
 * surrounding layout.
 */
export function UsageDonutChart({
  data,
  height = 240,
  innerRadius = 56,
  outerRadius = 84,
}: UsageDonutChartProps) {
  const money = useMoney();
  const filtered = data.filter((d) => d.costUsd > 0);
  if (filtered.length === 0) {
    return (
      <div style={{ height }}>
        <ChartEmptyState message="No cost data yet" />
      </div>
    );
  }
  return (
    <div style={{ height }} data-testid="usage-donut-chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="costUsd"
            nameKey="label"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={1}
            stroke="var(--color-bg-primary)"
          >
            {filtered.map((_, i) => (
              <Cell key={i} fill={paletteAt(i)} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-main)",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
            }}
            formatter={(v) => money.format(toNum(v))}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
