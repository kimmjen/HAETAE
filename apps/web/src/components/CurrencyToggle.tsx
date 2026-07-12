import { useMoney } from "@/lib/currency";

/**
 * Header toggle between USD and KRW display. Mirrors ThemeToggle — a single
 * bordered button; the label shows the currency you'll switch TO.
 */
export function CurrencyToggle() {
  const { currency, rate, toggle } = useMoney();
  const next = currency === "USD" ? "KRW" : "USD";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next}`}
      title={`1 USD ≈ ₩${Math.round(rate).toLocaleString("ko-KR")} (live) · click for ${next}`}
      className="px-2 py-1 text-[10px] font-bold border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors tabular-nums"
    >
      {currency === "USD" ? "$ USD" : "₩ KRW"}
    </button>
  );
}
