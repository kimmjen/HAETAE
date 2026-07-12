import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSystemRoutes } from "./system";

vi.mock("../services/system/auth-status", () => {
  const calls: number[] = [];
  return {
    __calls: calls,
    readAuthStatus: vi.fn(async () => {
      calls.push(Date.now());
      return {
        loggedIn: true,
        authMethod: "claude.ai",
        apiProvider: "firstParty",
        email: "user@example.com",
        orgId: "org-1",
        orgName: "Demo Org",
        subscriptionType: "pro",
      };
    }),
  };
});

vi.mock("../services/system/usage-limits", () => {
  return {
    readUsageLimits: vi.fn(async () => ({
      fiveHour: { utilization: 5, resetsAt: "2026-05-04T02:20:00Z" },
      sevenDay: { utilization: 71, resetsAt: "2026-05-04T07:00:00Z" },
      sevenDayOpus: null,
      sevenDaySonnet: null,
      extra: {
        enabled: true,
        monthlyLimit: 0,
        usedCredits: 0,
        utilization: null,
        currency: "USD",
      },
      subscriptionType: "pro",
      oauthExpiresAt: 1777839342202,
    })),
  };
});

describe("system routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await registerSystemRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("GET /auth-status returns subscriptionType + email + envelope", async () => {
    const res = await app.inject({ method: "GET", url: "/api/system/auth-status" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { subscriptionType: string; email: string; loggedIn: boolean };
      meta: { generatedAt: string; cacheTtlMs: number };
    };
    expect(body.data.subscriptionType).toBe("pro");
    expect(body.data.email).toBe("user@example.com");
    expect(body.data.loggedIn).toBe(true);
    expect(body.meta.cacheTtlMs).toBeGreaterThan(0);
  });

  it("caches across consecutive GETs (only 1 underlying read)", async () => {
    const mod = await import("../services/system/auth-status");
    const spy = vi.mocked(mod.readAuthStatus);
    spy.mockClear();

    await app.inject({ method: "GET", url: "/api/system/auth-status" });
    await app.inject({ method: "GET", url: "/api/system/auth-status" });
    await app.inject({ method: "GET", url: "/api/system/auth-status" });
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("POST /refresh forces a re-read", async () => {
    const mod = await import("../services/system/auth-status");
    const spy = vi.mocked(mod.readAuthStatus);

    await app.inject({ method: "GET", url: "/api/system/auth-status" });
    const before = spy.mock.calls.length;
    await app.inject({ method: "POST", url: "/api/system/auth-status/refresh" });
    expect(spy.mock.calls.length).toBeGreaterThan(before);
  });

  it("GET /usage-limits returns the OAuth-fetched windows", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/system/usage-limits",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: {
        fiveHour: { utilization: number; resetsAt: string } | null;
        sevenDay: { utilization: number } | null;
        subscriptionType: string | null;
      };
      meta: { source: string; cacheTtlMs: number };
    };
    expect(body.data.fiveHour?.utilization).toBe(5);
    expect(body.data.sevenDay?.utilization).toBe(71);
    expect(body.data.subscriptionType).toBe("pro");
    expect(body.meta.source).toBe("claude-cli-private");
  });

  it("POST /usage-limits/refresh forces re-read", async () => {
    const mod = await import("../services/system/usage-limits");
    const spy = vi.mocked(mod.readUsageLimits);
    spy.mockClear();

    await app.inject({ method: "GET", url: "/api/system/usage-limits" });
    const beforeCount = spy.mock.calls.length;
    await app.inject({
      method: "POST",
      url: "/api/system/usage-limits/refresh",
    });
    expect(spy.mock.calls.length).toBeGreaterThan(beforeCount);
  });
});
