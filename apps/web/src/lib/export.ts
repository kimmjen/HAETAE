/**
 * Tiny browser-side download helpers. We never round-trip through the
 * server for exports — the data is already in the page's React Query
 * cache, so we just stringify what's loaded and stream it as a Blob.
 */

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  triggerDownload(filename, blob);
}

/**
 * Convert an array of plain-object rows into a CSV string. Headers come
 * from the first row's keys. Cells get RFC4180-style quoting whenever
 * they contain a comma, quote, or newline; numbers/booleans pass
 * through as their natural string form. Nested objects are flattened
 * via JSON.stringify so cells stay as a single value.
 */
export function rowsToCsv(rows: ReadonlyArray<object>): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((acc, row) => {
      for (const k of Object.keys(row)) acc.add(k);
      return acc;
    }, new Set()),
  );
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers.map((h) => escape((row as Record<string, unknown>)[h])).join(","),
    );
  }
  return lines.join("\n");
}

export function downloadCsv(
  filename: string,
  rows: ReadonlyArray<object>,
): void {
  const blob = new Blob([rowsToCsv(rows)], { type: "text/csv" });
  triggerDownload(filename, blob);
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
