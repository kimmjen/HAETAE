import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFile, type FileResponse } from "./useFile";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useFile", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("does not fetch when path is null", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useFile(null), { wrapper: makeWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and returns content + frontmatter on success", async () => {
    const payload: FileResponse = {
      path: "rules/x.md",
      content: "body",
      frontmatter: { title: "x" },
      mtime: 1234,
    };
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useFile("rules/x.md"), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
  });

  it("URL-encodes the path query parameter", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ path: "x", content: "", frontmatter: {}, mtime: 0 }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderHook(() => useFile("rules/has space.md"), { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rules/file?path=rules%2Fhas%20space.md",
        expect.any(Object),
      ),
    );
  });

  it("surfaces an error when the server returns 404", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("nope", { status: 404 }),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useFile("rules/missing.md"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
