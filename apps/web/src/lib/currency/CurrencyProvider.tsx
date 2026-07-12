import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Currency } from "@/lib/format";

export interface CurrencyContextValue {
  currency: Currency;
  /** USD→KRW rate currently in effect (live or fallback). */
  rate: number;
  /** Effective date of the live rate (ECB publish date, "YYYY-MM-DD"), or null. */
  rateDate: string | null;
  setCurrency: (next: Currency) => void;
  toggle: () => void;
  /** Re-fetch the live rate now (manual refresh from the settings panel). */
  refreshRate: () => void;
}

/**
 * Default value (USD, fallback rate) so components work without a provider —
 * isolated component tests render the pre-existing USD behavior unchanged. The
 * real <CurrencyProvider> overrides this at the app root.
 */
// Cold-start only: shown for the brief moment before the first live fetch
// resolves on a first-ever load with no cached rate. We always fetch fresh, so
// this is never the steady-state value while online.
const FALLBACK_RATE = 1450;
const FX_URL = "https://api.frankfurter.dev/v1/latest?from=USD&to=KRW";
export const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  rate: FALLBACK_RATE,
  rateDate: null,
  setCurrency: () => {},
  toggle: () => {},
  refreshRate: () => {},
});

const CURRENCY_KEY = "haetae:currency";
const RATE_KEY = "haetae:fx-usd-krw";

function readInitialCurrency(): Currency {
  if (typeof window === "undefined") return "USD";
  const stored = window.localStorage.getItem(CURRENCY_KEY);
  return stored === "KRW" || stored === "USD" ? stored : "USD";
}

/** Cached rate from a prior session ({ rate, date }), or null. */
function readCachedRate(): { rate: number; date: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { rate?: unknown; date?: unknown };
    if (typeof parsed.rate === "number" && parsed.rate > 0 && typeof parsed.date === "string") {
      return { rate: parsed.rate, date: parsed.date };
    }
  } catch {
    // ignore malformed cache
  }
  return null;
}

interface CurrencyProviderProps {
  children: ReactNode;
}

export function CurrencyProvider({ children }: CurrencyProviderProps) {
  const [currency, setCurrencyState] = useState<Currency>(readInitialCurrency);
  const cached = readCachedRate();
  const [rate, setRate] = useState<number>(cached?.rate ?? FALLBACK_RATE);
  const [rateDate, setRateDate] = useState<string | null>(cached?.date ?? null);

  useEffect(() => {
    window.localStorage.setItem(CURRENCY_KEY, currency);
  }, [currency]);

  // Fetch the live rate from the free, no-key, CORS-enabled endpoint. Stores
  // the rate's effective date (ECB publish date). On any failure we keep the
  // cached/fallback rate.
  const fetchRate = useCallback((signal?: AbortSignal) => {
    return fetch(FX_URL, { signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { date?: string; rates?: { KRW?: number } }) => {
        const krw = data.rates?.KRW;
        if (typeof krw === "number" && krw > 0) {
          const date = typeof data.date === "string" ? data.date : new Date().toISOString().slice(0, 10);
          setRate(krw);
          setRateDate(date);
          window.localStorage.setItem(RATE_KEY, JSON.stringify({ rate: krw, date }));
        }
      })
      .catch(() => {
        // offline / blocked / rate-limited — keep cached or fallback rate.
      });
  }, []);

  // Always pull the latest rate live — on mount AND whenever the user refocuses
  // the app — so the displayed FX is the freshest available, never stale while
  // online. (Source publishes ~daily; cache is only an anti-flash seed.)
  useEffect(() => {
    const controller = new AbortController();
    const load = () => fetchRate(controller.signal);
    load();
    window.addEventListener("focus", load);
    return () => {
      controller.abort();
      window.removeEventListener("focus", load);
    };
  }, [fetchRate]);

  const toggle = useCallback(() => {
    setCurrencyState((c) => (c === "USD" ? "KRW" : "USD"));
  }, []);

  const refreshRate = useCallback(() => {
    void fetchRate();
  }, [fetchRate]);

  const value = useMemo<CurrencyContextValue>(
    () => ({ currency, rate, rateDate, setCurrency: setCurrencyState, toggle, refreshRate }),
    [currency, rate, rateDate, toggle, refreshRate],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}
