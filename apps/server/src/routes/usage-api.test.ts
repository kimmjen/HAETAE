import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../db";
import { usageApiEvents, usageEvents } from "../db/schema";
import { AdminClient } from "../services/usage-api";
import { registerUsageApiRoutes } from "./usage-api";

const HOUR_MS = 3600_000;
const DAY_MS = 86_400_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("usage-api routes", () => {
  let app: FastifyInstance;
  let db: Db;

  beforeEach(async () => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  function seedApi(opts: {
    bucketStart: number;
    model?: string;
    input?: number;
    output?: number;
    cacheRead?: number;
    costMicro?: number;
    fetchedAt?: number;
  }) {
    db.insert(usageApiEvents)
      .values({
        bucketStart: opts.bucketStart,
        bucketWidth: "1d",
        model: opts.model ?? "claude-opus-4-7",
        workspaceId: "",
        apiKeyId: "",
        inputTokens: opts.input ?? 0,
        outputTokens: opts.output ?? 0,
        cacheCreationTokens: 0,
        cacheReadTokens: opts.cacheRead ?? 0,
        costUsdMicro: opts.costMicro ?? 0,
        fetchedAt: opts.fetchedAt ?? Date.now(),
      })
      .run();
  }

  function seedLocal(opts: { ts: number; costMicro: number }) {
    db.insert(usageEvents)
      .values({
        sessionId: `s-${opts.ts}`,
        messageId: `m-${opts.ts}`,
        projectPath: "/x/Alpha",
        model: "claude-opus-4-7",
        ts: opts.ts,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsdMicro: opts.costMicro,
      })
      .run();
  }

  describe("when no admin key is configured", () => {
    beforeEach(async () => {
      const client = new AdminClient({ apiKey: "" });
      await registerUsageApiRoutes(app, { db, adminClient: client });
      await app.ready();
    });

    it("/summary returns configured=false but valid envelope", async () => {
      const res = await app.inject({ method: "GET", url: "/api/usage/api/summary" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { meta: { configured: boolean }; data: { costUsd: number } };
      expect(body.meta.configured).toBe(false);
      expect(body.data.costUsd).toBe(0);
    });

    it("POST /refresh responds 409 with a clear error", async () => {
      const res = await app.inject({ method: "POST", url: "/api/usage/api/refresh" });
      expect(res.statusCode).toBe(409);
      const body = res.json() as { error: string; meta: { configured: boolean } };
      expect(body.error).toMatch(/ANTHROPIC_ADMIN_KEY/);
      expect(body.meta.configured).toBe(false);
    });
  });

  describe("when admin key is configured (mocked client)", () => {
    let fetchImpl: typeof fetch;

    beforeEach(async () => {
      fetchImpl = (async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("usage_report")) {
          return jsonResponse({
            data: [
              {
                starting_at: "2026-04-01T00:00:00Z",
                ending_at: "2026-04-02T00:00:00Z",
                results: [
                  {
                    model: "claude-opus-4-7",
                    uncached_input_tokens: 100,
                    output_tokens: 200,
                  },
                ],
              },
            ],
            has_more: false,
            next_page: null,
          });
        }
        return jsonResponse({ data: [], has_more: false, next_page: null });
      }) as typeof fetch;

      const client = new AdminClient({ apiKey: "k", fetchImpl, baseUrl: "https://example.test" });
      await registerUsageApiRoutes(app, { db, adminClient: client });
      await app.ready();
    });

    it("POST /refresh runs the indexer and reports counts", async () => {
      const res = await app.inject({ method: "POST", url: "/api/usage/api/refresh" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        data: { usageBuckets: number; costBuckets: number; fetchedAt: number };
        meta: { configured: boolean; fetchedAt: number | null };
      };
      expect(body.meta.configured).toBe(true);
      expect(body.data.usageBuckets).toBe(1);
      expect(body.data.fetchedAt).toBeGreaterThan(0);
    });

    it("/summary aggregates seeded rows and surfaces fetchedAt", async () => {
      const t = Date.now() - HOUR_MS;
      seedApi({ bucketStart: t, input: 100, output: 200, costMicro: 1_000_000, fetchedAt: t });
      seedApi({
        bucketStart: t,
        model: "claude-sonnet-4-6",
        costMicro: 500_000,
        fetchedAt: t,
      });
      const res = await app.inject({ method: "GET", url: "/api/usage/api/summary?days=30" });
      const body = res.json() as {
        data: { costUsd: number; inputTokens: number };
        meta: { totalEvents: number; fetchedAt: number | null };
      };
      expect(body.data.costUsd).toBeCloseTo(1.5, 6);
      expect(body.data.inputTokens).toBe(100);
      expect(body.meta.totalEvents).toBe(2);
      expect(body.meta.fetchedAt).toBe(t);
    });

    it("/by-day groups by local-day and orders ascending", async () => {
      const now = Date.now();
      seedApi({ bucketStart: now - 2 * DAY_MS, costMicro: 1_000_000 });
      seedApi({ bucketStart: now - 1 * DAY_MS, costMicro: 2_000_000 });

      const res = await app.inject({ method: "GET", url: "/api/usage/api/by-day" });
      const body = res.json() as { data: Array<{ day: string; costUsd: number }> };
      expect(body.data).toHaveLength(2);
      expect(body.data[0]!.day < body.data[1]!.day).toBe(true);
    });

    it("/by-model sorts by cost desc", async () => {
      const t = Date.now() - HOUR_MS;
      seedApi({ bucketStart: t, model: "opus", costMicro: 5_000_000 });
      seedApi({ bucketStart: t, model: "sonnet", costMicro: 2_000_000 });
      const res = await app.inject({ method: "GET", url: "/api/usage/api/by-model" });
      const body = res.json() as { data: Array<{ model: string; costUsd: number }> };
      expect(body.data.map((r) => r.model)).toEqual(["opus", "sonnet"]);
    });

    it("/unified joins Local + API by day and reports delta", async () => {
      const now = Date.now();
      seedApi({ bucketStart: now - HOUR_MS, costMicro: 3_000_000 });
      seedLocal({ ts: now - HOUR_MS, costMicro: 2_000_000 });

      const res = await app.inject({ method: "GET", url: "/api/usage/api/unified" });
      const body = res.json() as {
        data: {
          rows: Array<{
            day: string;
            localCostUsd: number;
            apiCostUsd: number;
            deltaUsd: number;
          }>;
        };
      };
      expect(body.data.rows).toHaveLength(1);
      expect(body.data.rows[0]!.localCostUsd).toBeCloseTo(2.0, 6);
      expect(body.data.rows[0]!.apiCostUsd).toBeCloseTo(3.0, 6);
      expect(body.data.rows[0]!.deltaUsd).toBeCloseTo(1.0, 6);
    });
  });
});
