import { RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMoney, useFxHistory } from "@/lib/currency";
import { toNum } from "@/components/charts/internal";
import type { Currency } from "@/lib/format";

const rateFmt = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Display-currency settings: pick the default currency (shared with the header
 * toggle — same context) and view the live USD→KRW rate with its effective
 * date. Read + pick only; the rate itself is fetched live, not editable.
 */
export function CurrencySettings() {
  const { currency, rate, rateDate, setCurrency, refreshRate } = useMoney();

  return (
    <div className="space-y-5">
      <div>
        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
          Display Currency
        </label>
        <p className="text-[10px] text-text-subtle font-mono mt-1">
          Costs are stored in USD and converted at display time. Behaves the same as the header toggle.
        </p>
      </div>

      <div className="flex gap-px border border-border-main w-fit">
        {(["USD", "KRW"] as Currency[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCurrency(c)}
            aria-pressed={currency === c}
            className={
              currency === c
                ? "px-4 py-1.5 text-[10px] font-bold uppercase bg-accent text-text-on-accent"
                : "px-4 py-1.5 text-[10px] font-bold uppercase bg-bg-primary text-text-muted hover:bg-bg-hover transition-colors"
            }
          >
            {c === "USD" ? "$ USD" : "₩ KRW"}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
          Live Rate
        </label>
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-black tabular-nums text-text-main">
            1 USD = ₩{rateFmt.format(rate)}
          </span>
          <button
            type="button"
            onClick={refreshRate}
            aria-label="Refresh rate"
            title="Refresh now"
            className="p-1 border border-border-main bg-bg-primary text-text-muted hover:bg-bg-hover hover:text-text-main transition-colors"
          >
            <RefreshCw size={11} />
          </button>
        </div>
        <p className="text-[10px] text-text-subtle font-mono">
          {rateDate ? `as of ${rateDate} · ` : ""}source frankfurter.dev (ECB). Auto-refreshes on app entry / focus.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
          Trend (30D)
        </label>
        <FxTrendChart />
      </div>
    </div>
  );
}

function FxTrendChart() {
  const { data, isLoading, isError } = useFxHistory(30);
  const series = data ?? [];

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-[10px] font-mono text-text-subtle border border-border-subtle">
        Loading trend…
      </div>
    );
  }
  if (isError || series.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center text-[10px] font-mono text-text-subtle border border-border-subtle">
        Trend unavailable
      </div>
    );
  }

  // Narrow rate band → pad the Y domain so the line isn't a flat sliver.
  const rates = series.map((p) => p.rate);
  const min = Math.floor(Math.min(...rates) - 5);
  const max = Math.ceil(Math.max(...rates) + 5);

  return (
    <div className="h-40 border border-border-subtle p-2" data-testid="fx-trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border-subtle)" strokeDasharray="2 2" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: "var(--color-text-muted)" }}
            stroke="var(--color-border-subtle)"
            tickFormatter={(v: string) => v.slice(5)}
            minTickGap={28}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "var(--color-text-muted)" }}
            stroke="var(--color-border-subtle)"
            domain={[min, max]}
            tickFormatter={(v: number) => `₩${Math.round(v)}`}
            width={46}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-main)",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
            }}
            formatter={(v) => `₩${rateFmt.format(toNum(v))}`}
            labelFormatter={(label) => String(label ?? "")}
          />
          <Line
            type="monotone"
            dataKey="rate"
            name="USD→KRW"
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
