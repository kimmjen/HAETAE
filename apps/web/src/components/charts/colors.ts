/**
 * Centralised colour palette for usage charts. Bloomberg-tone (ADR 0008):
 * the four meaning colours (red / green / yellow / blue) carry chart
 * intent, the rest are muted accents that recycle for series cycling.
 *
 * Resolved as CSS `var(--color-ansi-N)` strings so a theme switch live
 * re-skins existing charts without re-render. Recharts accepts `fill`
 * and `stroke` props as raw CSS, so passing these through works.
 */

export const tokenSeriesColor = {
  input: "var(--color-ansi-4)", // blue
  output: "var(--color-ansi-2)", // green
  cacheCreation: "var(--color-ansi-3)", // yellow — cache writes are pricey
  cacheRead: "var(--color-ansi-6)", // cyan — cheap, kept muted
} as const;

/** Cycling palette for categorical charts (by-model, by-project). */
export const categoryPalette: readonly string[] = [
  "var(--color-ansi-4)", // blue
  "var(--color-ansi-2)", // green
  "var(--color-ansi-3)", // yellow
  "var(--color-ansi-1)", // red
  "var(--color-ansi-5)", // magenta
  "var(--color-ansi-6)", // cyan
  "var(--color-ansi-12)", // bright blue
  "var(--color-ansi-10)", // bright green
];

export function paletteAt(index: number): string {
  return categoryPalette[index % categoryPalette.length]!;
}
