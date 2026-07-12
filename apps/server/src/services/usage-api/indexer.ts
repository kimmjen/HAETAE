import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { usageApiEvents } from "../../db/schema";
import { AdminApiAuthError, AdminClient, type ReportRange } from "./admin-client";

/**
 * Pulls Anthropic's usage_report + cost_report into `usage_api_events`.
 * Two passes: tokens first, cost second. Both upsert on the same
 * natural key (bucket × model × workspace × api_key), so a missing
 * cost row simply leaves the cost field at 0 and a later refresh fills
 * it in.
 *
 * Returns counts so the UI's refresh button can show "+N rows" and the
 * mode (`fetched` vs `skipped`) for analytics.
 */

export interface IndexResult {
  /** True when the client wasn't configured (no key) — caller renders
   *  the "set ANTHROPIC_ADMIN_KEY to use" lock-state. */
  skipped: boolean;
  /** Buckets we INSERT-or-REPLACE'd in usage_report pass. */
  usageBuckets: number;
  /** Same for cost_report. */
  costBuckets: number;
  /** Stamp written to fetched_at on every row in this pass. */
  fetchedAt: number;
}

/** Convert Anthropic's string-decimal "12.345678" to integer micro-USD. */
function parseAmountToMicro(amount: string): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1_000_000);
}

export async function refreshAdminUsage(
  client: AdminClient,
  range: ReportRange,
  db: Db = getDb(),
): Promise<IndexResult> {
  if (!client.isConfigured) {
    return { skipped: true, usageBuckets: 0, costBuckets: 0, fetchedAt: 0 };
  }
  const fetchedAt = Date.now();
  const bucketWidth = range.bucketWidth ?? "1d";

  let usageBuckets = 0;
  let costBuckets = 0;

  // ---- usage_report (tokens) ----
  for await (const bucket of client.streamUsage(range)) {
    const start = parseTimestampMs(bucket.starting_at);
    if (start === null) continue;
    for (const r of bucket.results) {
      upsertTokens(db, {
        bucketStart: start,
        bucketWidth,
        model: r.model ?? "",
        workspaceId: r.workspace_id ?? "",
        apiKeyId: r.api_key_id ?? "",
        inputTokens: r.uncached_input_tokens ?? 0,
        outputTokens: r.output_tokens ?? 0,
        cacheCreationTokens: r.cache_creation_input_tokens ?? 0,
        cacheReadTokens: r.cache_read_input_tokens ?? 0,
        fetchedAt,
      });
    }
    usageBuckets += 1;
  }

  // ---- cost_report (USD) ----
  for await (const bucket of client.streamCost(range)) {
    const start = parseTimestampMs(bucket.starting_at);
    if (start === null) continue;
    for (const r of bucket.results) {
      upsertCost(db, {
        bucketStart: start,
        bucketWidth,
        model: r.model ?? "",
        workspaceId: r.workspace_id ?? "",
        apiKeyId: "", // cost_report doesn't usually break out by api_key
        costUsdMicro: parseAmountToMicro(r.amount),
        fetchedAt,
      });
    }
    costBuckets += 1;
  }

  return { skipped: false, usageBuckets, costBuckets, fetchedAt };
}

interface TokenUpsert {
  bucketStart: number;
  bucketWidth: string;
  model: string;
  workspaceId: string;
  apiKeyId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  fetchedAt: number;
}

function upsertTokens(db: Db, t: TokenUpsert): void {
  db.insert(usageApiEvents)
    .values({
      bucketStart: t.bucketStart,
      bucketWidth: t.bucketWidth,
      model: t.model,
      workspaceId: t.workspaceId,
      apiKeyId: t.apiKeyId,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      cacheCreationTokens: t.cacheCreationTokens,
      cacheReadTokens: t.cacheReadTokens,
      fetchedAt: t.fetchedAt,
    })
    .onConflictDoUpdate({
      target: [
        usageApiEvents.bucketStart,
        usageApiEvents.bucketWidth,
        usageApiEvents.model,
        usageApiEvents.workspaceId,
        usageApiEvents.apiKeyId,
      ],
      // Token columns are authoritative from usage_report. Don't touch
      // cost — the cost pass owns that.
      set: {
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        cacheCreationTokens: t.cacheCreationTokens,
        cacheReadTokens: t.cacheReadTokens,
        fetchedAt: t.fetchedAt,
      },
    })
    .run();
}

interface CostUpsert {
  bucketStart: number;
  bucketWidth: string;
  model: string;
  workspaceId: string;
  apiKeyId: string;
  costUsdMicro: number;
  fetchedAt: number;
}

function upsertCost(db: Db, c: CostUpsert): void {
  db.insert(usageApiEvents)
    .values({
      bucketStart: c.bucketStart,
      bucketWidth: c.bucketWidth,
      model: c.model,
      workspaceId: c.workspaceId,
      apiKeyId: c.apiKeyId,
      costUsdMicro: c.costUsdMicro,
      fetchedAt: c.fetchedAt,
    })
    .onConflictDoUpdate({
      target: [
        usageApiEvents.bucketStart,
        usageApiEvents.bucketWidth,
        usageApiEvents.model,
        usageApiEvents.workspaceId,
        usageApiEvents.apiKeyId,
      ],
      set: { costUsdMicro: c.costUsdMicro, fetchedAt: c.fetchedAt },
    })
    .run();
}

function parseTimestampMs(s: string): number | null {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** Re-export so callers don't have to import from admin-client just to
 *  catch auth errors. */
export { AdminApiAuthError };

/**
 * Helper for routes/tests: count rows + the latest fetched_at across
 * the whole table. UI uses these for the "cache age" KPI.
 */
export function getCacheStats(db: Db = getDb()): { rows: number; latestFetchedAt: number | null } {
  const row = db
    .select({
      rows: sql<number>`COUNT(*)`,
      latest: sql<number>`MAX(${usageApiEvents.fetchedAt})`,
    })
    .from(usageApiEvents)
    .get();
  return {
    rows: Number(row?.rows ?? 0),
    latestFetchedAt: row?.latest ? Number(row.latest) : null,
  };
}
