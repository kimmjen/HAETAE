import { describe, expect, it, vi } from "vitest";
import {
  AdminApiAuthError,
  AdminApiError,
  AdminClient,
  adminClientFromEnv,
} from "./admin-client";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("AdminClient.isConfigured", () => {
  it("is false for empty key", () => {
    const c = new AdminClient({ apiKey: "" });
    expect(c.isConfigured).toBe(false);
  });
  it("is true for any non-empty key", () => {
    const c = new AdminClient({ apiKey: "sk-ant-admin-x" });
    expect(c.isConfigured).toBe(true);
  });
});

describe("AdminClient.streamUsage", () => {
  it("yields nothing without consuming the network when no key is set", async () => {
    const fetchImpl: typeof fetch = vi.fn();
    const c = new AdminClient({ apiKey: "", fetchImpl });
    const out = [];
    for await (const b of c.streamUsage({ startingAt: "2026-01-01", endingAt: "2026-01-02" })) {
      out.push(b);
    }
    expect(out).toEqual([]);
    expect(vi.mocked(fetchImpl)).not.toHaveBeenCalled();
  });

  it("sends x-api-key + anthropic-version headers and the right query", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            starting_at: "2026-01-01T00:00:00Z",
            ending_at: "2026-01-02T00:00:00Z",
            results: [
              {
                uncached_input_tokens: 10,
                output_tokens: 20,
                cache_creation_input_tokens: 5,
                cache_read_input_tokens: 1,
                model: "claude-opus-4-7",
              },
            ],
          },
        ],
        has_more: false,
        next_page: null,
      }),
    );
    const c = new AdminClient({
      apiKey: "sk-ant-admin-x",
      fetchImpl,
      baseUrl: "https://example.test",
    });
    const out = [];
    for await (const b of c.streamUsage({
      startingAt: "2026-01-01T00:00:00Z",
      endingAt: "2026-01-02T00:00:00Z",
      bucketWidth: "1d",
    })) {
      out.push(b);
    }
    expect(out).toHaveLength(1);
    expect(out[0]!.results[0]!.model).toBe("claude-opus-4-7");
    const mock = vi.mocked(fetchImpl);
    expect(mock).toHaveBeenCalledTimes(1);

    const call = mock.mock.calls[0]!;
    expect(String(call[0])).toContain("/v1/organizations/usage_report/messages");
    expect(String(call[0])).toContain("starting_at=2026-01-01T00%3A00%3A00Z");
    expect(String(call[0])).toContain("ending_at=2026-01-02T00%3A00%3A00Z");
    expect(String(call[0])).toContain("bucket_width=1d");
    const headers = (call[1]?.headers ?? {}) as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-admin-x");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("follows next_page until has_more=false", async () => {
    const fetchImpl: typeof fetch = vi
      .fn()
      // page 1
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { starting_at: "2026-01-01T00:00:00Z", ending_at: "2026-01-02T00:00:00Z", results: [] },
          ],
          has_more: true,
          next_page: "PAGE2",
        }),
      )
      // page 2
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { starting_at: "2026-01-02T00:00:00Z", ending_at: "2026-01-03T00:00:00Z", results: [] },
          ],
          has_more: false,
          next_page: null,
        }),
      );

    const c = new AdminClient({
      apiKey: "sk-ant-admin-x",
      fetchImpl,
      baseUrl: "https://example.test",
    });
    const out = [];
    for await (const b of c.streamUsage({
      startingAt: "2026-01-01T00:00:00Z",
      endingAt: "2026-01-03T00:00:00Z",
    })) {
      out.push(b);
    }
    expect(out).toHaveLength(2);
    const mock = vi.mocked(fetchImpl);
    expect(mock).toHaveBeenCalledTimes(2);
    // second call carries next_page, not the original range params
    expect(String(mock.mock.calls[1]![0])).toContain("next_page=PAGE2");
    expect(String(mock.mock.calls[1]![0])).not.toContain("starting_at=");
  });

  it("throws AdminApiAuthError for 401/403", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => jsonResponse({ error: "nope" }, { status: 401 }));
    const c = new AdminClient({ apiKey: "k", fetchImpl });
    await expect(async () => {
      for await (const _ of c.streamUsage({ startingAt: "a", endingAt: "b" })) void _;
    }).rejects.toBeInstanceOf(AdminApiAuthError);
  });

  it("throws AdminApiError without echoing the response body for other errors", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      jsonResponse({ secret: "should not leak" }, { status: 500 }),
    );
    const c = new AdminClient({ apiKey: "k", fetchImpl });
    let caught: unknown;
    try {
      for await (const _ of c.streamUsage({ startingAt: "a", endingAt: "b" })) void _;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AdminApiError);
    expect((caught as Error).message).not.toContain("should not leak");
  });
});

describe("AdminClient.streamCost", () => {
  it("parses cost_report rows (amount as string)", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            starting_at: "2026-01-01T00:00:00Z",
            ending_at: "2026-01-02T00:00:00Z",
            results: [
              {
                amount: "12.345678",
                currency: "USD",
                cost_type: "tokens",
                model: "claude-opus-4-7",
              },
            ],
          },
        ],
        has_more: false,
        next_page: null,
      }),
    );
    const c = new AdminClient({ apiKey: "k", fetchImpl, baseUrl: "https://example.test" });
    const out = [];
    for await (const b of c.streamCost({ startingAt: "2026-01-01", endingAt: "2026-01-02" })) {
      out.push(b);
    }
    expect(out[0]!.results[0]!.amount).toBe("12.345678");
    const mock = vi.mocked(fetchImpl);
    expect(String(mock.mock.calls[0]![0])).toContain("/v1/organizations/cost_report");
  });
});

describe("adminClientFromEnv", () => {
  it("reads ANTHROPIC_ADMIN_KEY from env", () => {
    const c = adminClientFromEnv({ ANTHROPIC_ADMIN_KEY: "k" } as NodeJS.ProcessEnv);
    expect(c.isConfigured).toBe(true);
  });
  it("treats unset env as empty key", () => {
    const c = adminClientFromEnv({} as NodeJS.ProcessEnv);
    expect(c.isConfigured).toBe(false);
  });
});
