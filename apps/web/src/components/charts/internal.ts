/** Coerce a recharts Tooltip value (number | string | array) into a plain
 *  number for our formatters. Arrays only show up for stacked-bar style
 *  series where recharts hands [0, total]; we take the second element. */
export function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (Array.isArray(v) && v.length > 0) return toNum(v[v.length - 1]);
  return 0;
}
