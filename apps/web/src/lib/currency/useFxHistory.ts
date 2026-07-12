import { useQuery } from "@tanstack/react-query";

export interface FxPoint {
  /** "YYYY-MM-DD" */
  date: string;
  /** USD→KRW rate that day. */
  rate: number;
}

/**
 * Parse a frankfurter time-series response into a date-ascending {date,rate}
 * array. Tolerant of missing/malformed shapes (returns []). Drops days with no
 * numeric KRW value (e.g. weekends/holidays the source omits anyway).
 */
export function parseFxSeries(data: unknown): FxPoint[] {
  const rates = (data as { rates?: Record<string, { KRW?: unknown }> } | null)?.rates;
  if (!rates || typeof rates !== "object" || Array.isArray(rates)) return [];
  return Object.entries(rates)
    .map(([date, v]) => ({ date, rate: typeof v?.KRW === "number" ? v.KRW : NaN }))
    .filter((p) => Number.isFinite(p.rate))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Live USD→KRW history for the last `days` (frankfurter time-series — free,
 * no-key, CORS). Cached ~1h since the source publishes ~daily.
 */
export function useFxHistory(days = 30) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const startStr = ymd(start);
  const endStr = ymd(end);

  return useQuery({
    queryKey: ["fx-history", "USD", "KRW", startStr, endStr],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `https://api.frankfurter.dev/v1/${startStr}..${endStr}?from=USD&to=KRW`,
        { signal },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseFxSeries(await res.json());
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}
