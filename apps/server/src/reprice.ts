import path from "node:path";
import { getDb } from "./db";
import { getDbFilePath } from "./db/path";
import { repriceUsageEvents } from "./services/usage/reprice";
import { PRICING_AS_OF } from "./services/usage/pricing";

/**
 * Re-cost already-indexed usage events at the current `pricing.ts` rates.
 *
 * Run this after any rate correction: the indexer freezes cost at index time
 * and never revisits a row, so a fixed rate only applies to future events
 * until this sweeps the history. Reports by default; `--apply` writes.
 *
 *   pnpm --filter haetae-server reprice
 *   pnpm --filter haetae-server reprice -- --apply
 */

const usd = (micro: number) => `${micro < 0 ? "-" : ""}$${Math.abs(micro / 1e6).toFixed(2)}`;

function main(): void {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  console.log(`db      ${getDbFilePath()}`);
  console.log(`rates   ${PRICING_AS_OF}`);
  console.log(`mode    ${apply ? "APPLY" : "dry run (pass --apply to write)"}\n`);

  const out = repriceUsageEvents(db, apply);

  if (out.changed === 0) {
    console.log(`${out.scanned} events scanned, all already at current rates.`);
    process.exit(0);
  }

  const rows = Object.entries(out.byModel).sort((a, b) => a[1].deltaMicro - b[1].deltaMicro);
  const width = Math.max(...rows.map(([m]) => m.length));
  for (const [model, s] of rows) {
    console.log(`  ${model.padEnd(width)}  ${String(s.changed).padStart(7)} events  ${usd(s.deltaMicro).padStart(12)}`);
  }

  console.log(
    `\n${out.changed} of ${out.scanned} events ${apply ? "corrected" : "would change"}, ` +
      `net ${usd(out.deltaMicro)}.`,
  );
  process.exit(0);
}

// Only run when executed directly (not when imported by the unit tests).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
