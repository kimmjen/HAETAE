import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "../db";
import { usageApiEvents, usageEvents } from "../db/schema";
import {
  AdminApiAuthError,
  AdminClient,
  adminClientFromEnv,
  refreshAdminUsage,
} from "../services/usage-api";

/**
 * `/api/usage/api/*` — read-only aggregations over `usage_api_events`,
 * the table populated by `services/usage-api/indexer` from Anthropic's
 * Organization Admin reports (usage_report + cost_report).
 *
 * Conventions match `/api/usage/local/*` so the UI can swap data planes
 * without restructuring its hooks. Two key differences:
 * - response meta carries `configured` and `fetchedAt` so the UI can
 *   render a lock-state when no admin key is set, and a "refreshed Xm
 *   ago" stamp otherwise.
 * - the `/unified` endpoint joins by day across both planes so the
 *   Unified page can compare Local estimates vs API actuals.
 */

const DAYS_QUERY = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
const DAY_MS = 86_400_000;

function microToUsd(micro: number | null | undefined): number {
  return (micro ?? 0) / 1_000_000;
}
function shortLabel(absPath: string): string {
  return path.basename(absPath) || absPath;
}
function cutoffMs(days: number): number {
  return Date.now() - days * DAY_MS;
}

interface UsageMeta {
  generatedAt: string;
  totalEvents: number;
  /** True iff `ANTHROPIC_ADMIN_KEY` is set on the server. UI uses this
   *  to switch between data and lock-state. */
  configured: boolean;
  /** Most recent indexer fetch (unix ms). null when nothing has been
   *  fetched yet, or `configured === false`. */
  fetchedAt: number | null;
}

function envelope<T>(data: T, meta: UsageMeta) {
  return { data, meta };
}

export interface UsageApiRoutesOptions {
  db?: Db;
  /** Override for tests. Default: lazy `adminClientFromEnv`. */
  adminClient?: AdminClient;
}

export async function registerUsageApiRoutes(
  app: FastifyInstance,
  options: UsageApiRoutesOptions = {},
): Promise<void> {
  const db = options.db ?? getDb();
  const client = options.adminClient ?? adminClientFromEnv();

  const baseMeta = (totalEvents: number, fetchedAt: number | null): UsageMeta => ({
    generatedAt: new Date().toISOString(),
    totalEvents,
    configured: client.isConfigured,
    fetchedAt,
  });

  app.post("/api/usage/api/refresh", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!client.isConfigured) {
      reply.code(409);
      return {
        error: "ANTHROPIC_ADMIN_KEY is not set",
        meta: baseMeta(0, null),
      };
    }
    const { days } = DAYS_QUERY.parse(req.query);
    const range = {
      startingAt: new Date(cutoffMs(days)).toISOString(),
      endingAt: new Date().toISOString(),
      bucketWidth: "1d" as const,
    };
    try {
      const result = await refreshAdminUsage(client, range, db);
      return {
        data: {
          usageBuckets: result.usageBuckets,
          costBuckets: result.costBuckets,
          fetchedAt: result.fetchedAt,
        },
        meta: baseMeta(0, result.fetchedAt),
      };
    } catch (err) {
      if (err instanceof AdminApiAuthError) {
        reply.code(401);
        return { error: "admin key rejected by Anthropic", meta: baseMeta(0, null) };
      }
      reply.code(502);
      return { error: "admin api fetch failed", meta: baseMeta(0, null) };
    }
  });

  app.get("/api/usage/api/summary", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { days } = DAYS_QUERY.parse(req.query);
    const since = cutoffMs(days);
    const fetchedAt = latestFetchedAt(db);

    const row = db
      .select({
        inputTokens: sql<number>`COALESCE(SUM(${usageApiEvents.inputTokens}), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(${usageApiEvents.outputTokens}), 0)`,
        cacheCreationTokens: sql<number>`COALESCE(SUM(${usageApiEvents.cacheCreationTokens}), 0)`,
        cacheReadTokens: sql<number>`COALESCE(SUM(${usageApiEvents.cacheReadTokens}), 0)`,
        costUsdMicro: sql<number>`COALESCE(SUM(${usageApiEvents.costUsdMicro}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(usageApiEvents)
      .where(sql`${usageApiEvents.bucketStart} >= ${since}`)
      .get();

    return envelope(
      {
        days,
        inputTokens: Number(row?.inputTokens ?? 0),
        outputTokens: Number(row?.outputTokens ?? 0),
        cacheCreationTokens: Number(row?.cacheCreationTokens ?? 0),
        cacheReadTokens: Number(row?.cacheReadTokens ?? 0),
        costUsd: microToUsd(Number(row?.costUsdMicro ?? 0)),
      },
      baseMeta(Number(row?.count ?? 0), fetchedAt),
    );
  });

  app.get("/api/usage/api/by-day", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { days } = DAYS_QUERY.parse(req.query);
    const since = cutoffMs(days);
    const fetchedAt = latestFetchedAt(db);

    // bucket_start is already day-bucketed by Anthropic, but the same
    // day can appear once per (model, workspace, api_key) so we still
    // group by the local-day expression.
    const dayExpr = sql`strftime('%Y-%m-%d', ${usageApiEvents.bucketStart}/1000, 'unixepoch', 'localtime')`;
    const rows = db
      .select({
        day: dayExpr,
        inputTokens: sql`SUM(${usageApiEvents.inputTokens})`,
        outputTokens: sql`SUM(${usageApiEvents.outputTokens})`,
        cacheCreationTokens: sql`SUM(${usageApiEvents.cacheCreationTokens})`,
        cacheReadTokens: sql`SUM(${usageApiEvents.cacheReadTokens})`,
        costUsdMicro: sql`SUM(${usageApiEvents.costUsdMicro})`,
        count: sql`COUNT(*)`,
      })
      .from(usageApiEvents)
      .where(sql`${usageApiEvents.bucketStart} >= ${since}`)
      .groupBy(dayExpr)
      .orderBy(dayExpr)
      .all();

    const totalEvents = rows.reduce((s, r) => s + Number(r.count), 0);
    return envelope(
      rows.map((r) => ({
        day: r.day,
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
        cacheCreationTokens: Number(r.cacheCreationTokens),
        cacheReadTokens: Number(r.cacheReadTokens),
        costUsd: microToUsd(Number(r.costUsdMicro)),
      })),
      baseMeta(totalEvents, fetchedAt),
    );
  });

  app.get("/api/usage/api/by-model", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { days } = DAYS_QUERY.parse(req.query);
    const since = cutoffMs(days);
    const fetchedAt = latestFetchedAt(db);

    const rows = db
      .select({
        model: usageApiEvents.model,
        inputTokens: sql`SUM(${usageApiEvents.inputTokens})`,
        outputTokens: sql`SUM(${usageApiEvents.outputTokens})`,
        cacheCreationTokens: sql`SUM(${usageApiEvents.cacheCreationTokens})`,
        cacheReadTokens: sql`SUM(${usageApiEvents.cacheReadTokens})`,
        costUsdMicro: sql`SUM(${usageApiEvents.costUsdMicro})`,
        count: sql`COUNT(*)`,
      })
      .from(usageApiEvents)
      .where(sql`${usageApiEvents.bucketStart} >= ${since}`)
      .groupBy(usageApiEvents.model)
      .all();

    const sorted = rows.sort(
      (a, b) => Number(b.costUsdMicro) - Number(a.costUsdMicro),
    );
    const totalEvents = sorted.reduce((s, r) => s + Number(r.count), 0);
    return envelope(
      sorted.map((r) => ({
        model: r.model,
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
        cacheCreationTokens: Number(r.cacheCreationTokens),
        cacheReadTokens: Number(r.cacheReadTokens),
        costUsd: microToUsd(Number(r.costUsdMicro)),
        count: Number(r.count),
      })),
      baseMeta(totalEvents, fetchedAt),
    );
  });

  app.get("/api/usage/api/unified", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { days } = DAYS_QUERY.parse(req.query);
    const since = cutoffMs(days);
    const fetchedAt = latestFetchedAt(db);

    const localDayExpr = sql`strftime('%Y-%m-%d', ${usageEvents.ts}/1000, 'unixepoch', 'localtime')`;
    const apiDayExpr = sql`strftime('%Y-%m-%d', ${usageApiEvents.bucketStart}/1000, 'unixepoch', 'localtime')`;

    const local = db
      .select({
        day: localDayExpr,
        costUsdMicro: sql`SUM(${usageEvents.costUsdMicro})`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.ts} >= ${since}`)
      .groupBy(localDayExpr)
      .all();

    const api = db
      .select({
        day: apiDayExpr,
        costUsdMicro: sql`SUM(${usageApiEvents.costUsdMicro})`,
      })
      .from(usageApiEvents)
      .where(sql`${usageApiEvents.bucketStart} >= ${since}`)
      .groupBy(apiDayExpr)
      .all();

    type DayJoin = {
      day: string;
      localCostUsd: number;
      apiCostUsd: number;
      deltaUsd: number;
    };
    const map = new Map<string, DayJoin>();
    for (const r of local) {
      const day = String(r.day);
      map.set(day, {
        day,
        localCostUsd: microToUsd(Number(r.costUsdMicro)),
        apiCostUsd: 0,
        deltaUsd: 0,
      });
    }
    for (const r of api) {
      const day = String(r.day);
      const existing = map.get(day) ?? { day, localCostUsd: 0, apiCostUsd: 0, deltaUsd: 0 };
      existing.apiCostUsd = microToUsd(Number(r.costUsdMicro));
      map.set(day, existing);
    }
    const merged = [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
    for (const row of merged) row.deltaUsd = row.apiCostUsd - row.localCostUsd;

    return envelope({ days, rows: merged }, baseMeta(merged.length, fetchedAt));
  });

  // Unused for now but exposed for future drill-down ("by project" etc).
  void shortLabel;
}

function latestFetchedAt(db: Db): number | null {
  const row = db
    .select({ latest: sql<number>`MAX(${usageApiEvents.fetchedAt})` })
    .from(usageApiEvents)
    .get();
  return row?.latest ? Number(row.latest) : null;
}
