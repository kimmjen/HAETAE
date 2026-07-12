import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { usageApiEvents } from "../../db/schema";
import { AdminClient } from "./admin-client";
import { getCacheStats, refreshAdminUsage } from "./indexer";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeUsageBucket(opts: {
  start: string;
  rows: Array<{
    model: string;
    input?: number;
    output?: number;
    cacheCreate?: number;
    cacheRead?: number;
    workspaceId?: string;
    apiKeyId?: string;
  }>;
}) {
  return {
    starting_at: opts.start,
    ending_at: opts.start,
    results: opts.rows.map((r) => ({
      model: r.model,
      uncached_input_tokens: r.input ?? 0,
      output_tokens: r.output ?? 0,
      cache_creation_input_tokens: r.cacheCreate ?? 0,
      cache_read_input_tokens: r.cacheRead ?? 0,
      workspace_id: r.workspaceId ?? null,
      api_key_id: r.apiKeyId ?? null,
    })),
  };
}

function makeCostBucket(opts: {
  start: string;
  rows: Array<{ model: string; amount: string; workspaceId?: string }>;
}) {
  return {
    starting_at: opts.start,
    ending_at: opts.start,
    results: opts.rows.map((r) => ({
      amount: r.amount,
      currency: "USD",
      model: r.model,
      workspace_id: r.workspaceId ?? null,
    })),
  };
}

describe("refreshAdminUsage", () => {
  let db: Db;

  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
  });

  it("returns skipped when client has no key, leaves DB untouched", async () => {
    const client = new AdminClient({ apiKey: "" });
    const result = await refreshAdminUsage(client, {
      startingAt: "2026-04-01T00:00:00Z",
      endingAt: "2026-05-01T00:00:00Z",
    });
    expect(result.skipped).toBe(true);
    expect(result.usageBuckets).toBe(0);
    expect(db.select().from(usageApiEvents).all()).toHaveLength(0);
  });

  it("upserts token rows from usage_report and cost from cost_report", async () => {
    const fetchImpl: typeof fetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("usage_report")) {
        return jsonResponse({
          data: [
            makeUsageBucket({
              start: "2026-04-01T00:00:00Z",
              rows: [{ model: "claude-opus-4-7", input: 100, output: 200 }],
            }),
          ],
          has_more: false,
          next_page: null,
        });
      }
      if (u.includes("cost_report")) {
        return jsonResponse({
          data: [
            makeCostBucket({
              start: "2026-04-01T00:00:00Z",
              rows: [{ model: "claude-opus-4-7", amount: "1.234567" }],
            }),
          ],
          has_more: false,
          next_page: null,
        });
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as typeof fetch;

    const client = new AdminClient({
      apiKey: "k",
      fetchImpl,
      baseUrl: "https://example.test",
    });
    const result = await refreshAdminUsage(client, {
      startingAt: "2026-04-01T00:00:00Z",
      endingAt: "2026-05-01T00:00:00Z",
    });
    expect(result.skipped).toBe(false);
    expect(result.usageBuckets).toBe(1);
    expect(result.costBuckets).toBe(1);

    const rows = db.select().from(usageApiEvents).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: "claude-opus-4-7",
      inputTokens: 100,
      outputTokens: 200,
      // 1.234567 USD → 1_234_567 micro-USD
      costUsdMicro: 1_234_567,
    });
  });

  it("re-running the same range is idempotent (no row growth)", async () => {
    const fetchImpl: typeof fetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("usage_report")) {
        return jsonResponse({
          data: [
            makeUsageBucket({
              start: "2026-04-01T00:00:00Z",
              rows: [{ model: "opus", input: 50, output: 100 }],
            }),
          ],
          has_more: false,
          next_page: null,
        });
      }
      return jsonResponse({ data: [], has_more: false, next_page: null });
    }) as typeof fetch;

    const client = new AdminClient({
      apiKey: "k",
      fetchImpl,
      baseUrl: "https://example.test",
    });
    const range = { startingAt: "2026-04-01T00:00:00Z", endingAt: "2026-04-02T00:00:00Z" };
    await refreshAdminUsage(client, range, db);
    await refreshAdminUsage(client, range, db);
    const rows = db.select().from(usageApiEvents).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.inputTokens).toBe(50);
  });

  it("a later refresh with new token totals overwrites the prior values", async () => {
    let phase: "first" | "second" = "first";
    const fetchImpl: typeof fetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("usage_report")) {
        const input = phase === "first" ? 10 : 9999;
        return jsonResponse({
          data: [
            makeUsageBucket({
              start: "2026-04-01T00:00:00Z",
              rows: [{ model: "opus", input }],
            }),
          ],
          has_more: false,
          next_page: null,
        });
      }
      return jsonResponse({ data: [], has_more: false, next_page: null });
    }) as typeof fetch;

    const client = new AdminClient({
      apiKey: "k",
      fetchImpl,
      baseUrl: "https://example.test",
    });
    const range = { startingAt: "2026-04-01T00:00:00Z", endingAt: "2026-04-02T00:00:00Z" };
    await refreshAdminUsage(client, range, db);
    phase = "second";
    await refreshAdminUsage(client, range, db);
    const row = db.select().from(usageApiEvents).get();
    expect(row?.inputTokens).toBe(9999);
  });

  it("getCacheStats returns row count + latest fetched_at", async () => {
    expect(getCacheStats(db)).toEqual({ rows: 0, latestFetchedAt: null });

    const fetchImpl: typeof fetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("usage_report")) {
        return jsonResponse({
          data: [
            makeUsageBucket({
              start: "2026-04-01T00:00:00Z",
              rows: [{ model: "x" }],
            }),
          ],
          has_more: false,
          next_page: null,
        });
      }
      return jsonResponse({ data: [], has_more: false, next_page: null });
    }) as typeof fetch;

    const before = Date.now();
    await refreshAdminUsage(
      new AdminClient({ apiKey: "k", fetchImpl, baseUrl: "https://example.test" }),
      { startingAt: "2026-04-01T00:00:00Z", endingAt: "2026-04-02T00:00:00Z" },
      db,
    );
    const stats = getCacheStats(db);
    expect(stats.rows).toBe(1);
    expect(stats.latestFetchedAt).not.toBeNull();
    expect(stats.latestFetchedAt!).toBeGreaterThanOrEqual(before);
  });
});
