import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../db";
import { usageEvents } from "../db/schema";
import { registerUsageLocalRoutes } from "./usage-local";

const HOUR_MS = 3600_000;
const DAY_MS = 86_400_000;
const CLAUDE_HOME_ENV = "HAETAE_CLAUDE_HOME";

describe("usage-local routes", () => {
  let app: FastifyInstance;
  let db: Db;
  let originalClaudeHome: string | undefined;
  let claudeHome: string;

  beforeEach(async () => {
    // Isolate the indexer (used by /refresh) from the developer's real
    // ~/.claude — point it at an empty tmp dir so refresh sees 0 files.
    originalClaudeHome = process.env[CLAUDE_HOME_ENV];
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-usage-local-"));
    process.env[CLAUDE_HOME_ENV] = claudeHome;

    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    app = Fastify({ logger: false });
    await registerUsageLocalRoutes(app, { db });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
    if (originalClaudeHome === undefined) delete process.env[CLAUDE_HOME_ENV];
    else process.env[CLAUDE_HOME_ENV] = originalClaudeHome;
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  /** Insert a synthetic usage_events row at a specific timestamp. */
  function seed(opts: {
    sessionId?: string;
    messageId: string;
    project?: string;
    model?: string;
    ts: number;
    input?: number;
    output?: number;
    cacheCreate?: number;
    cacheRead?: number;
    costMicro?: number;
  }) {
    db.insert(usageEvents)
      .values({
        sessionId: opts.sessionId ?? "s",
        messageId: opts.messageId,
        projectPath: opts.project ?? "/x/Alpha",
        model: opts.model ?? "claude-sonnet-4-6",
        ts: opts.ts,
        inputTokens: opts.input ?? 0,
        outputTokens: opts.output ?? 0,
        cacheCreationTokens: opts.cacheCreate ?? 0,
        cacheReadTokens: opts.cacheRead ?? 0,
        costUsdMicro: opts.costMicro ?? 0,
      })
      .run();
  }

  describe("GET /api/usage/local/summary", () => {
    it("returns zero totals on an empty DB with envelope shape", async () => {
      const res = await app.inject({ method: "GET", url: "/api/usage/local/summary" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        data: { days: number; inputTokens: number; costUsd: number };
        meta: { generatedAt: string; totalEvents: number };
      };
      expect(body.data.days).toBe(30);
      expect(body.data.inputTokens).toBe(0);
      expect(body.data.costUsd).toBe(0);
      expect(body.meta.totalEvents).toBe(0);
      expect(typeof body.meta.generatedAt).toBe("string");
    });

    it("sums tokens + converts micro-USD to USD", async () => {
      const now = Date.now();
      seed({ messageId: "m1", ts: now - HOUR_MS, input: 100, output: 200, costMicro: 1_500_000 });
      seed({ messageId: "m2", ts: now - HOUR_MS, input: 300, output: 400, costMicro: 2_500_000 });

      const res = await app.inject({ method: "GET", url: "/api/usage/local/summary" });
      const body = res.json() as { data: { inputTokens: number; outputTokens: number; costUsd: number } };
      expect(body.data.inputTokens).toBe(400);
      expect(body.data.outputTokens).toBe(600);
      expect(body.data.costUsd).toBeCloseTo(4.0, 6);
    });

    it("respects ?days= cutoff (events older than the window are excluded)", async () => {
      const now = Date.now();
      seed({ messageId: "recent", ts: now - DAY_MS, costMicro: 1_000_000 });
      seed({ messageId: "old", ts: now - 60 * DAY_MS, costMicro: 9_000_000 });

      const res = await app.inject({ method: "GET", url: "/api/usage/local/summary?days=30" });
      const body = res.json() as { data: { costUsd: number }; meta: { totalEvents: number } };
      expect(body.meta.totalEvents).toBe(1);
      expect(body.data.costUsd).toBeCloseTo(1.0, 6);
    });
  });

  describe("GET /api/usage/local/by-day", () => {
    it("groups by local-day, ordered ascending", async () => {
      // Anchor seeded events to local-noon of two distinct days so the
      // grouping is deterministic regardless of when the test runs (the
      // earlier "now − 2*DAY_MS" form straddled a midnight boundary
      // some times of day and produced 3 buckets instead of 2).
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const dayA = today.getTime() - 2 * DAY_MS;
      const dayB = today.getTime() - 1 * DAY_MS;
      seed({ messageId: "a", ts: dayA, costMicro: 1_000_000 });
      seed({ messageId: "b", ts: dayB, costMicro: 2_000_000 });
      seed({ messageId: "c", ts: dayB + HOUR_MS, costMicro: 500_000 });

      const res = await app.inject({ method: "GET", url: "/api/usage/local/by-day" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { data: Array<{ day: string; costUsd: number }> };
      expect(body.data).toHaveLength(2);
      expect(body.data[0]!.day < body.data[1]!.day).toBe(true);
      expect(body.data[1]!.costUsd).toBeCloseTo(2.5, 6);
    });
  });

  describe("GET /api/usage/local/by-model", () => {
    it("groups by raw model id, sorted by cost desc", async () => {
      const now = Date.now();
      seed({ messageId: "o1", model: "claude-opus-4-7", ts: now - HOUR_MS, costMicro: 5_000_000 });
      seed({ messageId: "s1", model: "claude-sonnet-4-6", ts: now - HOUR_MS, costMicro: 1_000_000 });
      seed({ messageId: "s2", model: "claude-sonnet-4-6", ts: now - HOUR_MS, costMicro: 2_000_000 });

      const res = await app.inject({ method: "GET", url: "/api/usage/local/by-model" });
      const body = res.json() as { data: Array<{ model: string; costUsd: number; count: number }> };
      expect(body.data.map((r) => r.model)).toEqual(["claude-opus-4-7", "claude-sonnet-4-6"]);
      expect(body.data[0]!.costUsd).toBeCloseTo(5.0, 6);
      expect(body.data[1]!.count).toBe(2);
    });
  });

  describe("GET /api/usage/local/by-project", () => {
    it("groups by project_path, attaches a basename label", async () => {
      const now = Date.now();
      seed({ messageId: "a", project: "/x/Alpha", ts: now - HOUR_MS, costMicro: 3_000_000 });
      seed({ messageId: "b", project: "/y/Docs", ts: now - HOUR_MS, costMicro: 1_000_000 });

      const res = await app.inject({ method: "GET", url: "/api/usage/local/by-project" });
      const body = res.json() as {
        data: Array<{ projectPath: string; label: string; costUsd: number }>;
      };
      expect(body.data[0]).toMatchObject({ projectPath: "/x/Alpha", label: "Alpha" });
      expect(body.data[1]).toMatchObject({ projectPath: "/y/Docs", label: "Docs" });
    });
  });

  describe("GET /api/usage/local/heatmap", () => {
    it("returns a dense 7x24 grid (168 cells), zero-filled where no events", async () => {
      seed({ messageId: "a", ts: Date.now() - HOUR_MS, costMicro: 1_000_000 });

      const res = await app.inject({ method: "GET", url: "/api/usage/local/heatmap" });
      const body = res.json() as {
        data: { days: number; cells: Array<{ dayOfWeek: number; hour: number; costUsd: number; count: number }> };
      };
      expect(body.data.cells).toHaveLength(7 * 24);
      const populated = body.data.cells.filter((c) => c.count > 0);
      expect(populated).toHaveLength(1);
      expect(populated[0]!.costUsd).toBeCloseTo(1.0, 6);
    });
  });

  describe("GET /api/usage/local/recent-sessions", () => {
    it("groups by sessionId, sorted by latest activity, with limit", async () => {
      const now = Date.now();
      seed({ messageId: "a1", sessionId: "S-A", ts: now - HOUR_MS, costMicro: 1_000_000 });
      seed({ messageId: "a2", sessionId: "S-A", ts: now - HOUR_MS / 2, costMicro: 2_000_000 });
      seed({ messageId: "b1", sessionId: "S-B", ts: now - 2 * HOUR_MS, costMicro: 500_000 });

      const res = await app.inject({
        method: "GET",
        url: "/api/usage/local/recent-sessions?limit=5",
      });
      const body = res.json() as {
        data: Array<{ sessionId: string; eventCount: number; costUsd: number; lastTs: number }>;
      };
      expect(body.data).toHaveLength(2);
      expect(body.data[0]!.sessionId).toBe("S-A"); // more recent
      expect(body.data[0]!.eventCount).toBe(2);
      expect(body.data[0]!.costUsd).toBeCloseTo(3.0, 6);
    });

    it("attaches a basename label derived from projectPath", async () => {
      seed({
        messageId: "m",
        sessionId: "s",
        project: "/tmp/MyProject",
        ts: Date.now(),
        costMicro: 100,
      });
      const res = await app.inject({
        method: "GET",
        url: "/api/usage/local/recent-sessions?limit=5",
      });
      const body = res.json() as { data: Array<{ label: string }> };
      expect(body.data[0]!.label).toBe("MyProject");
    });
  });

  describe("GET /api/usage/local/recent-events", () => {
    it("returns events newest first, capped by ?limit", async () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        seed({ messageId: `m${i}`, sessionId: "s", ts: now - i * HOUR_MS, costMicro: 100 });
      }
      const res = await app.inject({
        method: "GET",
        url: "/api/usage/local/recent-events?limit=3",
      });
      const body = res.json() as {
        data: Array<{ messageId: string; ts: number }>;
      };
      expect(body.data).toHaveLength(3);
      // Newest first → m0 then m1 then m2
      expect(body.data.map((e) => e.messageId)).toEqual(["m0", "m1", "m2"]);
    });
  });

  describe("GET /api/usage/local/insights", () => {
    it("computes overall hit ratio + savings using family pricing", async () => {
      // 1M cache_read tokens on Sonnet → savings = (3 - 0.3) * 1M / 1M = $2.70
      // hit ratio = 1_000_000 / (0 + 0 + 1_000_000) = 1.0 (all cache)
      seed({
        messageId: "m1",
        ts: Date.now() - HOUR_MS,
        cacheRead: 1_000_000,
        costMicro: 300_000,
      });
      const res = await app.inject({ method: "GET", url: "/api/usage/local/insights?days=30" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        data: { hitRatio: number; cacheSavingsUsd: number; perModel: Array<{ model: string; savingsUsd: number; hitRatio: number }> };
      };
      expect(body.data.hitRatio).toBeCloseTo(1.0, 6);
      expect(body.data.cacheSavingsUsd).toBeCloseTo(2.7, 4);
      expect(body.data.perModel).toHaveLength(1);
      expect(body.data.perModel[0]!.savingsUsd).toBeCloseTo(2.7, 4);
    });

    it("unknown models contribute 0 savings (no fabricated rate)", async () => {
      seed({
        messageId: "m1",
        model: "<synthetic>",
        ts: Date.now() - HOUR_MS,
        cacheRead: 1_000_000,
      });
      const res = await app.inject({ method: "GET", url: "/api/usage/local/insights" });
      const body = res.json() as { data: { cacheSavingsUsd: number } };
      expect(body.data.cacheSavingsUsd).toBe(0);
    });

    it("groups perModel and perProject independently, sorted by savings/cacheRead desc", async () => {
      const t = Date.now() - HOUR_MS;
      seed({
        messageId: "a",
        sessionId: "s",
        project: "/x/Alpha",
        model: "claude-opus-4-7",
        ts: t,
        cacheRead: 1_000_000,
      });
      seed({
        messageId: "b",
        sessionId: "s",
        project: "/x/Other",
        model: "claude-sonnet-4-6",
        ts: t,
        cacheRead: 2_000_000,
      });
      const res = await app.inject({ method: "GET", url: "/api/usage/local/insights" });
      const body = res.json() as {
        data: {
          perModel: Array<{ model: string; savingsUsd: number }>;
          perProject: Array<{ label: string; cacheReadTokens: number }>;
        };
      };
      // savings = cacheRead * (input - cacheRead단가) / 1M (2026-06-06 단가):
      // Opus = 1M * (5 - 0.5) = 4.5 ; Sonnet = 2M * (3 - 0.3) = 5.4 → Sonnet 1위
      expect(body.data.perModel[0]!.model).toBe("claude-sonnet-4-6");
      expect(body.data.perProject[0]!.label).toBe("Other"); // 2M cache_read
    });

    it("returns zero metrics on empty DB", async () => {
      const res = await app.inject({ method: "GET", url: "/api/usage/local/insights" });
      const body = res.json() as { data: { hitRatio: number; cacheSavingsUsd: number } };
      expect(body.data.hitRatio).toBe(0);
      expect(body.data.cacheSavingsUsd).toBe(0);
    });
  });

  describe("GET /api/usage/local/windows", () => {
    it("splits totals into 5h / 24h / 7d / month buckets", async () => {
      const now = Date.now();
      // 1h ago — counts in all buckets (5h, 24h, 7d, month)
      seed({ messageId: "m-1h", ts: now - HOUR_MS, output: 10, costMicro: 100_000 });
      // 10h ago — out of 5h, in 24h/7d/month
      seed({ messageId: "m-10h", ts: now - 10 * HOUR_MS, output: 20, costMicro: 200_000 });
      // 3d ago — out of 24h, in 7d/month
      seed({ messageId: "m-3d", ts: now - 3 * DAY_MS, output: 40, costMicro: 400_000 });

      const res = await app.inject({
        method: "GET",
        url: "/api/usage/local/windows",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        data: {
          now: number;
          windows: {
            last5h: { count: number; outputTokens: number; costUsd: number };
            last24h: { count: number; outputTokens: number };
            last7d: { count: number; outputTokens: number };
            monthToDate: { count: number };
          };
        };
      };
      expect(body.data.windows.last5h.count).toBe(1);
      expect(body.data.windows.last5h.outputTokens).toBe(10);
      expect(body.data.windows.last5h.costUsd).toBeCloseTo(0.1);
      expect(body.data.windows.last24h.count).toBe(2);
      expect(body.data.windows.last24h.outputTokens).toBe(30);
      expect(body.data.windows.last7d.count).toBe(3);
      expect(body.data.windows.last7d.outputTokens).toBe(70);
    });
  });

  describe("POST /api/usage/local/refresh", () => {
    it("returns 0/0 when ~/.claude/projects/ is empty (deterministic)", async () => {
      const res = await app.inject({ method: "POST", url: "/api/usage/local/refresh" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        data: { filesScanned: number; totalInserted: number };
        meta: { generatedAt: string };
      };
      expect(body.data).toEqual({ filesScanned: 0, totalInserted: 0 });
      expect(typeof body.meta.generatedAt).toBe("string");
    });
  });

  describe("GET /api/usage/local/project-sessions", () => {
    it("returns 400 when projectPath is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/usage/local/project-sessions",
      });
      expect(res.statusCode).toBe(400);
    });

    it("filters by exact projectPath, ordered by lastTs desc", async () => {
      const now = Date.now();
      // Project A — two sessions
      seed({
        sessionId: "sA1",
        messageId: "mA1-1",
        project: "/x/A",
        ts: now - HOUR_MS,
        output: 10,
        costMicro: 100_000,
      });
      seed({
        sessionId: "sA1",
        messageId: "mA1-2",
        project: "/x/A",
        ts: now - 30 * 60 * 1000,
        output: 5,
        costMicro: 50_000,
      });
      seed({
        sessionId: "sA2",
        messageId: "mA2-1",
        project: "/x/A",
        ts: now - 2 * HOUR_MS,
        output: 20,
      });
      // Project B — one session, must be excluded
      seed({
        sessionId: "sB1",
        messageId: "mB1-1",
        project: "/x/B",
        ts: now - 5 * 60 * 1000,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/usage/local/project-sessions?projectPath=/x/A",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        data: Array<{
          sessionId: string;
          eventCount: number;
          outputTokens: number;
        }>;
      };
      expect(body.data.map((r) => r.sessionId)).toEqual(["sA1", "sA2"]);
      expect(body.data[0]?.eventCount).toBe(2);
      expect(body.data[0]?.outputTokens).toBe(15);
    });
  });

  describe("GET /api/usage/local/sessions/:sessionId", () => {
    /** Drop a fake session jsonl into the temp claudeHome. */
    function writeSession(encoded: string, sessionId: string, lines: object[]) {
      const dir = path.join(claudeHome, "projects", encoded);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${sessionId}.jsonl`),
        lines.map((l) => JSON.stringify(l)).join("\n"),
      );
    }

    it("returns 404 for a nonexistent session", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/usage/local/sessions/abcd1234-not-real",
      });
      expect(res.statusCode).toBe(404);
    });

    it("rejects malformed sessionId", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/usage/local/sessions/short",
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns parsed user / assistant timeline with totals", async () => {
      writeSession("-tmp-fake-project", "11111111-2222-3333-4444-555555555555", [
        { type: "permission-mode", permissionMode: "auto" },
        {
          type: "user",
          uuid: "u-1",
          timestamp: "2026-05-01T00:00:00Z",
          cwd: "/tmp/fake/project",
          message: { role: "user", content: "hi" },
        },
        {
          type: "assistant",
          uuid: "a-1",
          timestamp: "2026-05-01T00:00:01Z",
          message: {
            role: "assistant",
            model: "claude-sonnet-4-6",
            content: [{ type: "text", text: "hello back" }],
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 50,
            },
          },
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/usage/local/sessions/11111111-2222-3333-4444-555555555555",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        data: {
          sessionId: string;
          projectPath: string;
          messages: Array<{ role: string; parts: Array<{ kind: string; text?: string }> }>;
          totals: { messages: number; assistantMessages: number; outputTokens: number };
        };
      };
      expect(body.data.sessionId).toBe("11111111-2222-3333-4444-555555555555");
      expect(body.data.projectPath).toBe("/tmp/fake/project");
      expect(body.data.messages).toHaveLength(2);
      expect(body.data.messages[0]?.role).toBe("user");
      expect(body.data.messages[0]?.parts[0]?.text).toBe("hi");
      expect(body.data.messages[1]?.role).toBe("assistant");
      expect(body.data.messages[1]?.parts[0]?.text).toBe("hello back");
      expect(body.data.totals.messages).toBe(2);
      expect(body.data.totals.assistantMessages).toBe(1);
      expect(body.data.totals.outputTokens).toBe(20);
    });
  });
});
