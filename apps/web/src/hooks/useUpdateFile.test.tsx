import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileConflictError, useUpdateFile } from "./useUpdateFile";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return {
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
    client,
  };
}

describe("useUpdateFile", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("PUTs the body and returns the new file payload on success", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          path: "rules/x.md",
          content: "new",
          frontmatter: {},
          mtime: 200,
          backupId: 7,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateFile(), { wrapper: Wrapper });

    result.current.mutate({ path: "rules/x.md", content: "new", expectedMtime: 100 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.backupId).toBe(7);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rules/file",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("throws FileConflictError on 409 with expected/actual mtimes", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ expectedMtime: 100, actualMtime: 200 }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateFile(), { wrapper: Wrapper });
    result.current.mutate({ path: "rules/x.md", content: "v2", expectedMtime: 100 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(FileConflictError);
    const err = result.current.error as FileConflictError;
    expect(err.expectedMtime).toBe(100);
    expect(err.actualMtime).toBe(200);
  });

  it("invalidates the rules list query and seeds the file query on success", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          path: "rules/y.md",
          content: "v",
          frontmatter: {},
          mtime: 1,
          backupId: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const { Wrapper, client } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const setSpy = vi.spyOn(client, "setQueryData");

    const { result } = renderHook(() => useUpdateFile(), { wrapper: Wrapper });
    result.current.mutate({ path: "rules/y.md", content: "v", expectedMtime: 0 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(setSpy).toHaveBeenCalledWith(
      ["rules", "file", "global", "rules/y.md"],
      expect.any(Object),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["rules", "list", "global"],
    });
  });
});
