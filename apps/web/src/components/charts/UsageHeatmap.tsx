import { useMemo, useState } from "react";
import { useMoney } from "@/lib/currency";
import { ChartEmptyState } from "./EmptyState";

export interface UsageHeatmapCell {
  /** 0=Sunday … 6=Saturday */
  dayOfWeek: number;
  /** 0..23 */
  hour: number;
  costUsd: number;
  count: number;
}

interface UsageHeatmapProps {
  /** Dense 7×24 = 168 cells. The server `/heatmap` endpoint returns
   *  exactly this shape (zero-filled), so we don't need to defensively
   *  re-pad here — but we still tolerate sparse input. */
  cells: UsageHeatmapCell[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
type DayFilter = "all" | "weekday" | "weekend";
const DAY_FILTERS: DayFilter[] = ["all", "weekday", "weekend"];

/**
 * Phase 6.2 — 7×24 cost-by-time heatmap with three additions over v1:
 *
 *   1. Hour-average sparkline above the grid — "what does an average
 *      hour look like?". Helps spot global active hours at a glance.
 *   2. Top 5 productive hours (across all days) ringed in accent —
 *      tells the user "this is when I actually do things".
 *   3. weekday / weekend / all toggle — separates the daily-rhythm
 *      story from the weekend story without two charts.
 *
 * No external chart lib — CSS table + a thin SVG sparkline. Bloomberg
 * accent (blue) is the "high" colour, fading to bg-secondary at 0.
 */
export function UsageHeatmap({ cells }: UsageHeatmapProps) {
  const money = useMoney();
  const [filter, setFilter] = useState<DayFilter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return cells;
    if (filter === "weekday")
      return cells.filter((c) => c.dayOfWeek >= 1 && c.dayOfWeek <= 5);
    return cells.filter((c) => c.dayOfWeek === 0 || c.dayOfWeek === 6);
  }, [cells, filter]);

  const max = filtered.reduce((m, c) => Math.max(m, c.costUsd), 0);
  const lookup = useMemo(() => {
    const m = new Map<string, UsageHeatmapCell>();
    for (const c of filtered) m.set(`${c.dayOfWeek}:${c.hour}`, c);
    return m;
  }, [filtered]);

  // Hour-averages across whichever days the filter includes.
  const visibleDays = filter === "all" ? 7 : filter === "weekday" ? 5 : 2;
  const hourAvg = useMemo(() => {
    const sums = new Array<number>(24).fill(0);
    for (const c of filtered) sums[c.hour]! += c.costUsd;
    const out: number[] = [];
    for (let h = 0; h < 24; h++) {
      out.push(visibleDays > 0 ? sums[h]! / visibleDays : 0);
    }
    return out;
  }, [filtered, visibleDays]);
  const hourAvgMax = Math.max(1, ...hourAvg);

  // Top 5 (day, hour) cells by cost — productive moments.
  const topCells = useMemo(() => {
    const set = new Set<string>();
    [...filtered]
      .sort((a, b) => b.costUsd - a.costUsd)
      .filter((c) => c.costUsd > 0)
      .slice(0, 5)
      .forEach((c) => set.add(`${c.dayOfWeek}:${c.hour}`));
    return set;
  }, [filtered]);

  if (max === 0) {
    return (
      <div className="space-y-2">
        <DayFilterToggle value={filter} onChange={setFilter} />
        <div className="h-[260px]">
          <ChartEmptyState message="No time-of-day data yet" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="usage-heatmap">
      <DayFilterToggle value={filter} onChange={setFilter} />

      {/* Hour-average sparkline — area-ish bars across 24 hours. */}
      <div className="flex items-end gap-px h-6 ml-8 pr-1">
        {hourAvg.map((v, h) => {
          const heightPct = (v / hourAvgMax) * 100;
          return (
            <div
              key={h}
              className="flex-1 bg-accent/60"
              style={{ height: `${Math.max(3, heightPct)}%` }}
              title={`${h}:00 avg ${money.format(v)}`}
            />
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="text-[9px] font-mono border-separate border-spacing-[1px]">
          <thead>
            <tr>
              <th className="text-text-subtle font-normal w-8" aria-hidden />
              {Array.from({ length: 24 }, (_, h) => (
                <th
                  key={h}
                  className="text-text-subtle font-normal w-6 text-center"
                  scope="col"
                >
                  {h % 3 === 0 ? h : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 7 }, (_, d) => {
              const isVisible =
                filter === "all" ||
                (filter === "weekday" && d >= 1 && d <= 5) ||
                (filter === "weekend" && (d === 0 || d === 6));
              return (
                <tr key={d} className={isVisible ? "" : "opacity-30"}>
                  <th
                    className="text-text-muted font-normal text-right pr-1 uppercase"
                    scope="row"
                  >
                    {DAYS[d]}
                  </th>
                  {Array.from({ length: 24 }, (_, h) => {
                    const cell = lookup.get(`${d}:${h}`);
                    const intensity = cell ? cell.costUsd / max : 0;
                    const top = topCells.has(`${d}:${h}`);
                    return (
                      <td
                        key={h}
                        className={
                          top
                            ? "w-5 h-5 border-2 border-accent"
                            : "w-5 h-5 border border-border-subtle"
                        }
                        style={{
                          backgroundColor:
                            intensity > 0
                              ? `color-mix(in srgb, var(--color-accent) ${
                                  Math.max(8, intensity * 100)
                                }%, var(--color-bg-secondary))`
                              : "var(--color-bg-secondary)",
                        }}
                        title={
                          cell
                            ? `${DAYS[d]} ${h}:00 — ${money.format(cell.costUsd)} (${cell.count} msg)`
                            : `${DAYS[d]} ${h}:00 — no activity`
                        }
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DayFilterToggle({
  value,
  onChange,
}: {
  value: DayFilter;
  onChange: (v: DayFilter) => void;
}) {
  return (
    <div role="tablist" aria-label="Heatmap day filter" className="inline-flex border border-border-main">
      {DAY_FILTERS.map((f) => {
        const active = f === value;
        return (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(f)}
            className={
              active
                ? "px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-accent text-text-on-accent"
                : "px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-bg-primary text-text-muted hover:text-text-main transition-colors"
            }
          >
            {f}
          </button>
        );
      })}
    </div>
  );
}
