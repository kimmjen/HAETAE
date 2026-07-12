import { useContext } from "react";
import { CurrencyContext, type CurrencyContextValue } from "./CurrencyProvider";
import { formatMoney, formatMoneyCompact } from "@/lib/format";

export interface UseMoney extends CurrencyContextValue {
  /** Full-precision money in the active currency (was `formatUsd`). */
  format: (usdValue: number) => string;
  /** Compact money for narrow surfaces (was `formatUsdCompact`). */
  formatCompact: (usdValue: number) => string;
}

/**
 * Currency-aware money formatting bound to the active currency + rate. Cost
 * data is stored in USD; these convert+format per the header toggle. Drop-in
 * for the old `formatUsd`/`formatUsdCompact` (USD path is identical).
 */
export function useMoney(): UseMoney {
  const ctx = useContext(CurrencyContext);
  return {
    ...ctx,
    format: (usdValue: number) => formatMoney(usdValue, ctx.currency, ctx.rate),
    formatCompact: (usdValue: number) => formatMoneyCompact(usdValue, ctx.currency, ctx.rate),
  };
}
