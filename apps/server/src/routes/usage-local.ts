import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import { getDb, type Db } from "../db";
import { usageEvents, usageFileCursor } from "../db/schema";
import { indexAll, PRICING, PRICING_AS_OF, modelFamily } from "../services/usage";
import { loadSessionDetail } from "../services/usage/session-detail";

const DAYS_QUERY = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const DAY_MS = 86_400_000;

interface Envelope<T> {
  data: T;
  meta: {
    generatedAt: string;
    totalEvents: number;
  };
}

function envelope<T>(data: T, totalEvents: number): Envelope<T> {
  return {
    data,
    meta: { generatedAt: new Date().toISOString(), totalEvents },
  };
}

/** Convert micro-USD (DB storage unit) to USD with 6-decimal precision. */
function microToUsd(micro: number | null | undefined): number {
  return (micro ?? 0) / 1_000_000;
}

/** Reduce a cwd to its basename so charts stay readable when paths are
 *  long. The full path is still in `absolutePath`-like fields when
 *  needed; here we want a tight legend label. */
function shortLabel(absPath: string): string {
  return path.basename(absPath) || absPath;
}

function cutoffMs(days: number): number {
  return Date.now() - days * DAY_MS;
}

/**
 * `/api/usage/local/*` — read-only aggregations over `usage_events`,
 * indexed from `~/.claude/projects/<encoded>/<uuid>.jsonl` by
 * `services/usage/indexer`.
 *
 * Conventions:
 * - Every list endpoint accepts `?days=N` (1..365, default 30).
 * - Responses are wrapped in `{ data, meta }` so clients can show a
 *   "generated at" stamp + total event count.
 * - cost is returned as USD (number, 6-decimal precision); DB stores
 *   integer micro-USD so SUM stays exact.
 * - All endpoints reply `Cache-Control: no-store` — usage data shifts
 *   every time the user runs claude.
 */
export async function registerUsageLocalRoutes(
  app: FastifyInstance,
  options: { db?: Db } = {},
): Promise<void> {
  const db = options.db ?? getDb();

  // POST /refresh — UI button or scheduled trigger. Runs the indexer
  // once and returns counts so the client can show a toast.
  // Read-only — surfaces the current Anthropic public pricing table the
  // server uses for cost estimates, plus the calendar date it was last
  // verified. Footer renders an "as of …" stamp so a stale rate table
  // is at least visible.
  app.get("/api/usage/local/pricing-info", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return {
      data: { asOf: PRICING_AS_OF, rates: PRICING },
      meta: { generatedAt: new Date().toISOString() },
    };
  });

  // Active sessions — JSONL files modified within the last 120 s are
  // considered "live" (Claude Code is still writing to them). Stat-only,
  // no file reads, so it's cheap enough to poll every 15 s from the UI.
  const LIVE_WINDOW_MS = 120_000;
  app.get("/api/usage/local/active-sessions", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    const now = Date.now();
    const cursors = db.select({ filePath: usageFileCursor.filePath }).from(usageFileCursor).all();
    const active: string[] = [];
    await Promise.all(
      cursors.map(async ({ filePath }) => {
        try {
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs < LIVE_WINDOW_MS) {
            active.push(path.basename(filePath, ".jsonl"));
          }
        } catch {
          // file gone — skip
        }
      }),
    );
    return {
      data: { sessionIds: active, checkedAt: now },
      meta: { generatedAt: new Date().toISOString() },
    };
  });

  app.post("/api/usage/local/refresh", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    const result = await indexAll(db);
    return {
      data: {
        filesScanned: result.filesScanned,
        totalInserted: result.totalInserted,
      },
      meta: { generatedAt: new Date().toISOString() },
    };
  });

  // Rolling-window totals — Claude Code 의 Pro 한도가 5h 윈도우 단위라
  // 사용자가 \"이번 5시간 동안 얼마 썼지?\" 를 묻는다. 7d / month-to-date
  // 도 같이 묶어 한 번에 응답. 한도 자체는 모르므로 비교는 #141 의
  // localStorage 임계치를 UI 가 함께 보여줌.
  app.get("/api/usage/local/windows", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    const now = Date.now();
    const HOUR = 3_600_000;
    const since5h = now - 5 * HOUR;
    const since24h = now - 24 * HOUR;
    const since7d = now - 7 * DAY_MS;
    // Calendar month-to-date in local time. SQLite 는 strftime 으로 처리.
    const monthPrefix = new Date(now)
      .toISOString()
      .slice(0, 7); // \"YYYY-MM\"

    const rangeRow = (sinceMs: number) =>
      db
        .select({
          inputTokens: sql`COALESCE(SUM(${usageEvents.inputTokens}), 0)`,
          outputTokens: sql`COALESCE(SUM(${usageEvents.outputTokens}), 0)`,
          cacheReadTokens: sql`COALESCE(SUM(${usageEvents.cacheReadTokens}), 0)`,
          costUsdMicro: sql`COALESCE(SUM(${usageEvents.costUsdMicro}), 0)`,
          count: sql`COUNT(*)`,
        })
        .from(usageEvents)
        .where(sql`${usageEvents.ts} >= ${sinceMs}`)
        .get();

    const monthRow = db
      .select({
        inputTokens: sql`COALESCE(SUM(${usageEvents.inputTokens}), 0)`,
        outputTokens: sql`COALESCE(SUM(${usageEvents.outputTokens}), 0)`,
        cacheReadTokens: sql`COALESCE(SUM(${usageEvents.cacheReadTokens}), 0)`,
        costUsdMicro: sql`COALESCE(SUM(${usageEvents.costUsdMicro}), 0)`,
        count: sql`COUNT(*)`,
      })
      .from(usageEvents)
      .where(
        sql`strftime('%Y-%m', ${usageEvents.ts}/1000, 'unixepoch', 'localtime') = ${monthPrefix}`,
      )
      .get();

    const shape = (row: typeof monthRow) => ({
      inputTokens: Number(row?.inputTokens ?? 0),
      outputTokens: Number(row?.outputTokens ?? 0),
      cacheReadTokens: Number(row?.cacheReadTokens ?? 0),
      costUsd: microToUsd(Number(row?.costUsdMicro ?? 0)),
      count: Number(row?.count ?? 0),
    });

    const last5h = rangeRow(since5h);
    const last24h = rangeRow(since24h);
    const last7d = rangeRow(since7d);

    return envelope(
      {
        now,
        windows: {
          last5h: shape(last5h),
          last24h: shape(last24h),
          last7d: shape(last7d),
          monthToDate: shape(monthRow),
        },
      },
      shape(last7d).count,
    );
  });

  app.get("/api/usage/local/summary", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { days } = DAYS_QUERY.parse(req.query);
    const since = cutoffMs(days);

    const row = db
      .select({
        inputTokens: sql`COALESCE(SUM(${usageEvents.inputTokens}), 0)`,
        outputTokens: sql`COALESCE(SUM(${usageEvents.outputTokens}), 0)`,
        cacheCreationTokens: sql`COALESCE(SUM(${usageEvents.cacheCreationTokens}), 0)`,
        cacheReadTokens: sql`COALESCE(SUM(${usageEvents.cacheReadTokens}), 0)`,
        costUsdMicro: sql`COALESCE(SUM(${usageEvents.costUsdMicro}), 0)`,
        count: sql`COUNT(*)`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.ts} >= ${since}`)
      .get();

    const totalEvents = Number(row?.count ?? 0);
    return envelope(
      {
        days,
        inputTokens: Number(row?.inputTokens ?? 0),
        outputTokens: Number(row?.outputTokens ?? 0),
        cacheCreationTokens: Number(row?.cacheCreationTokens ?? 0),
        cacheReadTokens: Number(row?.cacheReadTokens ?? 0),
        costUsd: microToUsd(Number(row?.costUsdMicro ?? 0)),
      },
      totalEvents,
    );
  });

  app.get("/api/usage/local/by-day", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { days } = DAYS_QUERY.parse(req.query);
    const since = cutoffMs(days);

    // SQLite GROUP BY can reference SELECT aliases, but drizzle emits
    // sql`day` as a quoted identifier rather than an alias ref — that
    // triggers "no such column: day". Sharing the expression keeps the
    // generated SQL valid.
    const dayExpr = sql`strftime('%Y-%m-%d', ${usageEvents.ts}/1000, 'unixepoch', 'localtime')`;
    const rows = db
      .select({
        day: dayExpr,
        inputTokens: sql`SUM(${usageEvents.inputTokens})`,
        outputTokens: sql`SUM(${usageEvents.outputTokens})`,
        cacheCreationTokens: sql`SUM(${usageEvents.cacheCreationTokens})`,
        cacheReadTokens: sql`SUM(${usageEvents.cacheReadTokens})`,
        costUsdMicro: sql`SUM(${usageEvents.costUsdMicro})`,
        count: sql`COUNT(*)`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.ts} >= ${since}`)
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
      totalEvents,
    );
  });

  app.get("/api/usage/local/by-model", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { days } = DAYS_QUERY.parse(req.query);
    const since = cutoffMs(days);

    const rows = db
      .select({
        model: usageEvents.model,
        inputTokens: sql`SUM(${usageEvents.inputTokens})`,
        outputTokens: sql`SUM(${usageEvents.outputTokens})`,
        cacheCreationTokens: sql`SUM(${usageEvents.cacheCreationTokens})`,
        cacheReadTokens: sql`SUM(${usageEvents.cacheReadTokens})`,
        costUsdMicro: sql`SUM(${usageEvents.costUsdMicro})`,
        count: sql`COUNT(*)`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.ts} >= ${since}`)
      .groupBy(usageEvents.model)
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
      totalEvents,
    );
  });

  app.get("/api/usage/local/by-project", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { days } = DAYS_QUERY.parse(req.query);
    const since = cutoffMs(days);

    const rows = db
      .select({
        projectPath: usageEvents.projectPath,
        inputTokens: sql`SUM(${usageEvents.inputTokens})`,
        outputTokens: sql`SUM(${usageEvents.outputTokens})`,
        cacheCreationTokens: sql`SUM(${usageEvents.cacheCreationTokens})`,
        cacheReadTokens: sql`SUM(${usageEvents.cacheReadTokens})`,
        costUsdMicro: sql`SUM(${usageEvents.costUsdMicro})`,
        count: sql`COUNT(*)`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.ts} >= ${since}`)
      .groupBy(usageEvents.projectPath)
      .all();

    const sorted = rows.sort(
      (a, b) => Number(b.costUsdMicro) - Number(a.costUsdMicro),
    );
    const totalEvents = sorted.reduce((s, r) => s + Number(r.count), 0);
    return envelope(
      sorted.map((r) => ({
        projectPath: r.projectPath,
        label: shortLabel(r.projectPath),
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
        cacheCreationTokens: Number(r.cacheCreationTokens),
        cacheReadTokens: Number(r.cacheReadTokens),
        costUsd: microToUsd(Number(r.costUsdMicro)),
        count: Number(r.count),
      })),
      totalEvents,
    );
  });

  app.get("/api/usage/local/heatmap", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { days } = DAYS_QUERY.parse(req.query);
    const since = cutoffMs(days);

    const dowExpr = sql`CAST(strftime('%w', ${usageEvents.ts}/1000, 'unixepoch', 'localtime') AS INTEGER)`;
    const hourExpr = sql`CAST(strftime('%H', ${usageEvents.ts}/1000, 'unixepoch', 'localtime') AS INTEGER)`;
    const rows = db
      .select({
        dow: dowExpr,
        hour: hourExpr,
        costUsdMicro: sql`SUM(${usageEvents.costUsdMicro})`,
        count: sql`COUNT(*)`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.ts} >= ${since}`)
      .groupBy(dowExpr, hourExpr)
      .all();

    // Dense 7×24 grid so the UI can render a fixed Sun..Sat / 0..23 table
    // without holes. dayOfWeek 0=Sunday matches strftime '%w'.
    const grid: Array<{ dayOfWeek: number; hour: number; costUsd: number; count: number }> = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        grid.push({ dayOfWeek: d, hour: h, costUsd: 0, count: 0 });
      }
    }
    for (const r of rows) {
      const d = Math.max(0, Math.min(6, Number(r.dow)));
      const h = Math.max(0, Math.min(23, Number(r.hour)));
      const cell = grid[d * 24 + h]!;
      cell.costUsd = microToUsd(Number(r.costUsdMicro));
      cell.count = Number(r.count);
    }
    const totalEvents = rows.reduce((s, r) => s + Number(r.count), 0);
    return envelope({ days, cells: grid }, totalEvents);
  });

  // Recent activity — feeds the Overview page's "Recent Sessions" panel.
  // One row per session_id, ordered by most-recent activity.
  app.get("/api/usage/local/recent-sessions", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(50).default(5) })
      .parse(req.query);

    const lastTsExpr = sql`MAX(${usageEvents.ts})`;
    const rows = db
      .select({
        sessionId: usageEvents.sessionId,
        // sessions are usually scoped to one project; MAX is just a way to
        // pick a deterministic value across the group without aggregate
        // gymnastics — `projectPath` is identical for every row in the set.
        projectPath: sql`MAX(${usageEvents.projectPath})`,
        model: sql`MAX(${usageEvents.model})`,
        lastTs: lastTsExpr,
        inputTokens: sql`SUM(${usageEvents.inputTokens})`,
        outputTokens: sql`SUM(${usageEvents.outputTokens})`,
        cacheReadTokens: sql`SUM(${usageEvents.cacheReadTokens})`,
        costUsdMicro: sql`SUM(${usageEvents.costUsdMicro})`,
        count: sql`COUNT(*)`,
      })
      .from(usageEvents)
      .groupBy(usageEvents.sessionId)
      .orderBy(sql`${lastTsExpr} DESC`)
      .limit(limit)
      .all();

    return envelope(
      rows.map((r) => {
        const projectPath = String(r.projectPath ?? "");
        return {
          sessionId: r.sessionId,
          projectPath,
          label: shortLabel(projectPath),
          model: String(r.model ?? "unknown"),
          lastTs: Number(r.lastTs),
          inputTokens: Number(r.inputTokens),
          outputTokens: Number(r.outputTokens),
          cacheReadTokens: Number(r.cacheReadTokens),
          costUsd: microToUsd(Number(r.costUsdMicro)),
          eventCount: Number(r.count),
        };
      }),
      rows.length,
    );
  });

  // Recent activity — feeds the Overview page's "Audit" table. One row
  // per assistant message, newest first. Read-only timeline.
  app.get("/api/usage/local/recent-events", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(10) })
      .parse(req.query);

    const rows = db
      .select()
      .from(usageEvents)
      .orderBy(sql`${usageEvents.ts} DESC`)
      .limit(limit)
      .all();

    return envelope(
      rows.map((r) => ({
        sessionId: r.sessionId,
        messageId: r.messageId,
        projectPath: r.projectPath,
        label: shortLabel(r.projectPath),
        model: r.model,
        ts: r.ts,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheReadTokens: r.cacheReadTokens,
        costUsd: microToUsd(r.costUsdMicro),
      })),
      rows.length,
    );
  });

  // Cache efficiency insights — Phase 6.1.
  //
  // Two metrics:
  //   hitRatio = cache_read / (input + cache_creation + cache_read)
  //     "of all input tokens, what fraction came from cache?"
  //   savingsUsd = cache_read_tokens × (input_rate - cache_read_rate) / 1e6
  //     "how much did caching shave off vs paying full input rate"
  //
  // Both totals + breakdowns by model and by project. Family pricing is
  // looked up server-side per row group so unknown models contribute 0
  // (no fabricated savings).
  app.get("/api/usage/local/insights", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { days } = DAYS_QUERY.parse(req.query);
    const since = cutoffMs(days);

    const perModel = db
      .select({
        model: usageEvents.model,
        inputTokens: sql<number>`COALESCE(SUM(${usageEvents.inputTokens}), 0)`,
        cacheCreationTokens: sql<number>`COALESCE(SUM(${usageEvents.cacheCreationTokens}), 0)`,
        cacheReadTokens: sql<number>`COALESCE(SUM(${usageEvents.cacheReadTokens}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.ts} >= ${since}`)
      .groupBy(usageEvents.model)
      .all();

    const perProject = db
      .select({
        projectPath: usageEvents.projectPath,
        inputTokens: sql<number>`COALESCE(SUM(${usageEvents.inputTokens}), 0)`,
        cacheCreationTokens: sql<number>`COALESCE(SUM(${usageEvents.cacheCreationTokens}), 0)`,
        cacheReadTokens: sql<number>`COALESCE(SUM(${usageEvents.cacheReadTokens}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.ts} >= ${since}`)
      .groupBy(usageEvents.projectPath)
      .all();

    const perModelOut = perModel
      .map((r) => {
        const input = Number(r.inputTokens);
        const ccTok = Number(r.cacheCreationTokens);
        const crTok = Number(r.cacheReadTokens);
        const totalIn = input + ccTok + crTok;
        const rate = PRICING[modelFamily(r.model ?? "")];
        const savings = (crTok * (rate.input - rate.cacheRead)) / 1_000_000;
        return {
          model: r.model,
          inputTokens: input,
          cacheCreationTokens: ccTok,
          cacheReadTokens: crTok,
          hitRatio: totalIn > 0 ? crTok / totalIn : 0,
          savingsUsd: savings,
          count: Number(r.count),
        };
      })
      .sort((a, b) => b.savingsUsd - a.savingsUsd);

    const perProjectOut = perProject
      .map((r) => {
        const input = Number(r.inputTokens);
        const ccTok = Number(r.cacheCreationTokens);
        const crTok = Number(r.cacheReadTokens);
        const totalIn = input + ccTok + crTok;
        return {
          projectPath: r.projectPath,
          label: shortLabel(r.projectPath),
          inputTokens: input,
          cacheCreationTokens: ccTok,
          cacheReadTokens: crTok,
          hitRatio: totalIn > 0 ? crTok / totalIn : 0,
          count: Number(r.count),
        };
      })
      .sort((a, b) => b.cacheReadTokens - a.cacheReadTokens);

    const totalsTokens = perModelOut.reduce(
      (acc, r) => {
        acc.input += r.inputTokens;
        acc.cacheCreation += r.cacheCreationTokens;
        acc.cacheRead += r.cacheReadTokens;
        acc.savings += r.savingsUsd;
        return acc;
      },
      { input: 0, cacheCreation: 0, cacheRead: 0, savings: 0 },
    );
    const denom =
      totalsTokens.input + totalsTokens.cacheCreation + totalsTokens.cacheRead;
    const hitRatio = denom > 0 ? totalsTokens.cacheRead / denom : 0;
    const totalEvents = perModelOut.reduce((s, r) => s + r.count, 0);

    return envelope(
      {
        days,
        hitRatio,
        cacheReadTokens: totalsTokens.cacheRead,
        cacheSavingsUsd: totalsTokens.savings,
        perModel: perModelOut,
        perProject: perProjectOut,
      },
      totalEvents,
    );
  });

  // Per-project session list — same shape as recent-sessions but filtered
  // by exact projectPath. Project page mounts this so the user can see
  // every past session for a given cwd and click into the drill-down.
  app.get("/api/usage/local/project-sessions", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = z
      .object({
        projectPath: z.string().min(1).max(4096),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_query", issues: parsed.error.issues };
    }
    const { projectPath, limit } = parsed.data;

    const lastTsExpr = sql`MAX(${usageEvents.ts})`;
    const rows = db
      .select({
        sessionId: usageEvents.sessionId,
        model: sql`MAX(${usageEvents.model})`,
        lastTs: lastTsExpr,
        firstTs: sql`MIN(${usageEvents.ts})`,
        inputTokens: sql`SUM(${usageEvents.inputTokens})`,
        outputTokens: sql`SUM(${usageEvents.outputTokens})`,
        cacheReadTokens: sql`SUM(${usageEvents.cacheReadTokens})`,
        costUsdMicro: sql`SUM(${usageEvents.costUsdMicro})`,
        count: sql`COUNT(*)`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.projectPath} = ${projectPath}`)
      .groupBy(usageEvents.sessionId)
      .orderBy(sql`${lastTsExpr} DESC`)
      .limit(limit)
      .all();

    return envelope(
      rows.map((r) => ({
        sessionId: r.sessionId,
        model: String(r.model ?? "unknown"),
        lastTs: Number(r.lastTs),
        firstTs: Number(r.firstTs),
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
        cacheReadTokens: Number(r.cacheReadTokens),
        costUsd: microToUsd(Number(r.costUsdMicro)),
        eventCount: Number(r.count),
      })),
      rows.length,
    );
  });

  // All-sessions list — filterable by days + optional projectPath.
  // Feeds the /watching/sessions index page so the user can browse every
  // session without going through Overview or a project page.
  app.get("/api/usage/local/sessions", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = z
      .object({
        days: z.coerce.number().int().min(1).max(365).default(30),
        projectPath: z.string().min(1).max(4096).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_query", issues: parsed.error.issues };
    }
    const { days, projectPath, limit } = parsed.data;
    const since = cutoffMs(days);

    const lastTsExpr = sql`MAX(${usageEvents.ts})`;
    const whereClause = projectPath
      ? sql`${usageEvents.ts} >= ${since} AND ${usageEvents.projectPath} = ${projectPath}`
      : sql`${usageEvents.ts} >= ${since}`;

    const rows = db
      .select({
        sessionId: usageEvents.sessionId,
        projectPath: sql`MAX(${usageEvents.projectPath})`,
        model: sql`MAX(${usageEvents.model})`,
        lastTs: lastTsExpr,
        firstTs: sql`MIN(${usageEvents.ts})`,
        inputTokens: sql`SUM(${usageEvents.inputTokens})`,
        outputTokens: sql`SUM(${usageEvents.outputTokens})`,
        cacheReadTokens: sql`SUM(${usageEvents.cacheReadTokens})`,
        costUsdMicro: sql`SUM(${usageEvents.costUsdMicro})`,
        count: sql`COUNT(*)`,
      })
      .from(usageEvents)
      .where(whereClause)
      .groupBy(usageEvents.sessionId)
      .orderBy(sql`${lastTsExpr} DESC`)
      .limit(limit)
      .all();

    return envelope(
      rows.map((r) => {
        const pp = String(r.projectPath ?? "");
        return {
          sessionId: r.sessionId,
          projectPath: pp,
          label: shortLabel(pp),
          model: String(r.model ?? "unknown"),
          lastTs: Number(r.lastTs),
          firstTs: Number(r.firstTs),
          inputTokens: Number(r.inputTokens),
          outputTokens: Number(r.outputTokens),
          cacheReadTokens: Number(r.cacheReadTokens),
          costUsd: microToUsd(Number(r.costUsdMicro)),
          eventCount: Number(r.count),
        };
      }),
      rows.length,
    );
  });

  // Drill-down — read the JSONL for a single session and return its
  // user/assistant messages in chronological order. Bypasses the
  // `usage_events` table because that only stores per-message token
  // totals; the human-readable content lives only in the JSONL.
  app.get("/api/usage/local/sessions/:sessionId", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = z
      .object({ sessionId: z.string().regex(/^[a-zA-Z0-9_-]+$/).min(8).max(64) })
      .safeParse(req.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_session_id", message: "잘못된 세션 ID 형식" };
    }
    const { sessionId } = parsed.data;
    const detail = await loadSessionDetail(sessionId);
    if (!detail) {
      reply.code(404);
      return {
        error: "session_not_found",
        message: `세션 jsonl 파일을 찾지 못했습니다: ${sessionId}`,
      };
    }
    return {
      data: detail,
      meta: {
        generatedAt: new Date().toISOString(),
        totalEvents: detail.totals.assistantMessages,
      },
    };
  });
}
