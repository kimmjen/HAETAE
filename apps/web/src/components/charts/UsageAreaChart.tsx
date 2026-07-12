import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTokens, formatTokensCompact } from "@/lib/format/tokens";
import { tokenSeriesColor } from "./colors";
import { ChartEmptyState } from "./EmptyState";
import { toNum } from "./internal";

export interface UsageAreaPoint {
  day: string; // YYYY-MM-DD (local)
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

interface UsageAreaChartProps {
  data: UsageAreaPoint[];
  /** Layout height in px. Defaults to 240. */
  height?: number;
}

/**
 * Stacked area chart for daily token usage. Four series share the day
 * axis: input, output, cache_creation, cache_read. Cache_read is by far
 * the largest in volume so we keep its colour muted and stack it last
 * (top of the stack) — the user can still tell input/output trends from
 * the lower bands at a glance.
 */
export function UsageAreaChart({ data, height = 240 }: UsageAreaChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ height }}>
        <ChartEmptyState
          message="No usage recorded yet"
          hint="Fills in automatically once a claude session ends"
        />
      </div>
    );
  }
  return (
    <div style={{ height }} data-testid="usage-area-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border-subtle)" strokeDasharray="2 2" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
            stroke="var(--color-border-subtle)"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
            stroke="var(--color-border-subtle)"
            // 축은 compact 로 (1.2m), 풀 값은 hover 시 Tooltip 이 보여줌.
            // 좁은 화면에서 plot 영역을 잠식하지 않도록 width 도 축소.
            tickFormatter={(v: number) => formatTokensCompact(v)}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-main)",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
            }}
            formatter={(v) => formatTokens(toNum(v))}
          />
          <Area
            type="monotone"
            dataKey="inputTokens"
            stackId="1"
            stroke={tokenSeriesColor.input}
            fill={tokenSeriesColor.input}
            fillOpacity={0.6}
            name="Input"
          />
          <Area
            type="monotone"
            dataKey="outputTokens"
            stackId="1"
            stroke={tokenSeriesColor.output}
            fill={tokenSeriesColor.output}
            fillOpacity={0.6}
            name="Output"
          />
          <Area
            type="monotone"
            dataKey="cacheCreationTokens"
            stackId="1"
            stroke={tokenSeriesColor.cacheCreation}
            fill={tokenSeriesColor.cacheCreation}
            fillOpacity={0.45}
            name="Cache write"
          />
          <Area
            type="monotone"
            dataKey="cacheReadTokens"
            stackId="1"
            stroke={tokenSeriesColor.cacheRead}
            fill={tokenSeriesColor.cacheRead}
            fillOpacity={0.3}
            name="Cache read"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
