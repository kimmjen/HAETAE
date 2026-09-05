import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { usageEvents } from "../../db/schema";
import { calculateCost, toMicroUsd } from "./pricing";

/**
 * Recompute stored costs at the current `pricing.ts` rates.
 *
 * The indexer freezes `cost_usd_micro` at index time and is idempotent — the
 * `(session_id, message_id)` UNIQUE constraint means it will never revisit a
 * row it has already written. So when a rate is corrected (Sonnet 5 shipped at
 * $2/$10 while the table still said $3/$15), every event already indexed keeps
 * the wrong number forever unless something goes back over them.
 *
 * Nothing here re-reads JSONL: `usage_events` stores the model and all four
 * token counts, so the cost is recomputable in place. The file cursors and
 * every second-brain table are untouched, which is the difference between this
 * and deleting `cache.db`.
 */

export interface RepriceSummary {
  scanned: number;
  changed: number;
  /** Signed micro-USD, new total minus old — negative means over-billed. */
  deltaMicro: number;
  /** Per-model totals, changed models only. */
  byModel: Record<string, { changed: number; deltaMicro: number }>;
}

export function repriceUsageEvents(db: Db = getDb(), apply = false): RepriceSummary {
  const rows = db.select().from(usageEvents).all();
  const out: RepriceSummary = { scanned: rows.length, changed: 0, deltaMicro: 0, byModel: {} };
  const pending: Array<{ id: number; micro: number }> = [];

  for (const r of rows) {
    const micro = toMicroUsd(
      calculateCost(r.model, {
        input: r.inputTokens,
        output: r.outputTokens,
        cacheCreation: r.cacheCreationTokens,
        cacheRead: r.cacheReadTokens,
      }),
    );
    if (micro === r.costUsdMicro) continue;

    const delta = micro - r.costUsdMicro;
    out.changed += 1;
    out.deltaMicro += delta;
    const m = (out.byModel[r.model] ??= { changed: 0, deltaMicro: 0 });
    m.changed += 1;
    m.deltaMicro += delta;
    pending.push({ id: r.id, micro });
  }

  if (apply && pending.length > 0) {
    // One transaction so a crash mid-run cannot leave costs half-corrected.
    db.transaction((tx) => {
      for (const p of pending) {
        tx.update(usageEvents)
          .set({ costUsdMicro: p.micro })
          .where(sql`${usageEvents.id} = ${p.id}`)
          .run();
      }
    });
  }

  return out;
}
