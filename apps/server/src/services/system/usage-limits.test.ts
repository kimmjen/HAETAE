import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readUsageLimits, RawSchema } from "./usage-limits";
import { readClaudeOauth } from "./keychain";

// Keychain + network are mocked so the flag-gating tests are deterministic
// regardless of whether the dev machine actually has Claude OAuth credentials
// (real creds made these tests hit the live API and leak real account usage).
vi.mock("./keychain", () => ({ readClaudeOauth: vi.fn() }));

const ENV = "HAETAE_USE_OAUTH_LIMITS";

describe("RawSchema — live API shape", () => {
  // Verbatim shape from GET /api/oauth/usage when extra usage is off: the
  // number/string fields come back as null, not undefined. Regression for the
  // bug where z.number().optional() rejected null → whole parse failed →
  // readUsageLimits returned null → Overview progress bars stayed empty.
  it("parses null extra_usage fields", () => {
    const live = {
      five_hour: { utilization: 82.0, resets_at: "2026-06-05T10:00:00Z" },
      seven_day: { utilization: 17.0, resets_at: "2026-06-11T23:59:59Z" },
      seven_day_opus: null,
      seven_day_sonnet: null,
      extra_usage: {
        is_enabled: false,
        monthly_limit: null,
        used_credits: null,
        utilization: null,
        currency: null,
        disabled_reason: null,
      },
    };
    const parsed = RawSchema.safeParse(live);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.five_hour?.utilization).toBe(82);
      expect(parsed.data.extra_usage?.monthly_limit).toBeNull();
    }
  });

  it("parses unknown future fields via passthrough", () => {
    const withExtras = {
      five_hour: { utilization: 5, resets_at: null },
      tangelo: null,
      iguana_necktie: null,
    };
    expect(RawSchema.safeParse(withExtras).success).toBe(true);
  });
});

describe("readUsageLimits — opt-in flag", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV];
    vi.mocked(readClaudeOauth).mockReset();
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV];
    else process.env[ENV] = original;
    vi.unstubAllGlobals();
  });

  it("returns null when the flag is not exactly 'true', without touching the keychain", async () => {
    for (const v of [undefined, "false", "1", "yes", "TRUE", ""]) {
      if (v === undefined) delete process.env[ENV];
      else process.env[ENV] = v;
      expect(await readUsageLimits()).toBeNull();
    }
    expect(readClaudeOauth).not.toHaveBeenCalled();
  });

  it("returns null when enabled but no OAuth token is present (logged out / non-mac)", async () => {
    process.env[ENV] = "true";
    vi.mocked(readClaudeOauth).mockResolvedValue(null);
    expect(await readUsageLimits()).toBeNull();
  });

  it("fetches limits only when the flag === 'true'", async () => {
    process.env[ENV] = "true";
    vi.mocked(readClaudeOauth).mockResolvedValue({
      accessToken: "sk-ant-oat01-test",
      refreshToken: "",
      expiresAt: 123,
      scopes: [],
      subscriptionType: "pro",
      rateLimitTier: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            five_hour: { utilization: 82, resets_at: "2026-06-06T10:00:00Z" },
            seven_day: { utilization: 17, resets_at: null },
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await readUsageLimits();
    expect(result?.fiveHour?.utilization).toBe(82);
    expect(result?.subscriptionType).toBe("pro");
  });
});
