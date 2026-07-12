import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet } from "./api-client";

describe("apiGet", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on a 2xx response", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const result = await apiGet<{ ok: boolean }>("/api/test");
    expect(result).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/test", expect.any(Object));
  });

  it("throws ApiError with status on a non-2xx response", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("nope", { status: 500, statusText: "Internal Server Error" }),
    ) as unknown as typeof fetch;

    await expect(apiGet("/api/oops")).rejects.toBeInstanceOf(ApiError);
    await expect(apiGet("/api/oops")).rejects.toMatchObject({ status: 500, url: "/api/oops" });
  });

  it("prefixes a leading slash if the path does not start with one", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiGet("api/rules/list");
    expect(fetchMock).toHaveBeenCalledWith("/api/rules/list", expect.any(Object));
  });

  it("forwards an AbortSignal to fetch", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const ctrl = new AbortController();
    await apiGet("/api/x", { signal: ctrl.signal });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ signal: ctrl.signal }),
    );
  });
});
