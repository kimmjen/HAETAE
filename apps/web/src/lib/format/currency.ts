export type Currency = "USD" | "KRW";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const krw = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

export function formatUsd(value: number): string {
  return usd.format(value);
}

/**
 * KPI / 사이드바 / TopHeader 같은 좁은 surface 용. 천 단위 미만은
 * 센트까지 살리고 (가격 감각 유지), 천 단위부터는 compact 로 떨어뜨려
 * `text-[18px] font-black` 카드 폭에 들어오게 한다. 양/음 부호 보존,
 * 0 또는 ±0.005 미만은 `$0` 으로 통일해 사인 노이즈 제거.
 */
export function formatUsdCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs < 0.005) return "$0";
  if (abs < 0.01) return value < 0 ? "-<$0.01" : "<$0.01";
  const sign = value < 0 ? "-" : "";
  if (abs < 1000) return `${sign}$${abs.toFixed(2)}`;
  if (abs < 1_000_000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  if (abs < 1_000_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}m`;
  return `${sign}$${(abs / 1_000_000_000).toFixed(1)}b`;
}

/** Compact KRW for the same narrow surfaces — 소수점 없는 정수 원화, 천 단위부터
    k/m/b. `formatUsdCompact` 의 원화판. 미세 금액은 ₩0/<₩1 로 노이즈 제거. */
function formatKrwCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs < 0.5) return "₩0";
  if (abs < 1) return value < 0 ? "-<₩1" : "<₩1";
  const sign = value < 0 ? "-" : "";
  if (abs < 1000) return `${sign}₩${Math.round(abs)}`;
  if (abs < 1_000_000) return `${sign}₩${(abs / 1000).toFixed(1)}k`;
  if (abs < 1_000_000_000) return `${sign}₩${(abs / 1_000_000).toFixed(1)}m`;
  return `${sign}₩${(abs / 1_000_000_000).toFixed(1)}b`;
}

/**
 * 통화 인식 포맷터. 비용은 USD 로 저장되므로 `usdValue` 를 받아 표시 통화로
 * 환산해 포맷한다. USD 경로는 기존 `formatUsd*` 와 정확히 동일(회귀 방지).
 */
export function formatMoney(usdValue: number, currency: Currency, rate: number): string {
  if (currency === "USD") return formatUsd(usdValue);
  return krw.format(usdValue * rate);
}

export function formatMoneyCompact(usdValue: number, currency: Currency, rate: number): string {
  if (currency === "USD") return formatUsdCompact(usdValue);
  return formatKrwCompact(usdValue * rate);
}
