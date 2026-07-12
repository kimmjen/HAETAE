const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const grouped = new Intl.NumberFormat("en-US");

export function formatTokens(value: number): string {
  return grouped.format(value);
}

export function formatTokensCompact(value: number): string {
  return compact.format(value).toLowerCase();
}
