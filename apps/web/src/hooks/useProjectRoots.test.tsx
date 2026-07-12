import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DuplicateRootError,
  InvalidRootPathError,
  useAddProjectRoot,
  useDeleteProjectRoot,
} from "./useProjectRoots";

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

describe("useAddProjectRoot", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POSTs to /api/projects/roots and returns the row on 201", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: 1, absolutePath: "/x/y" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { Wrapper, client } = makeWrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAddProjectRoot(), { wrapper: Wrapper });

    result.current.mutate("/x/y");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ id: 1, absolutePath: "/x/y" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/roots",
      expect.objectContaining({ method: "POST" }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects", "list"] });
  });

  it("throws DuplicateRootError on 409 with source", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ path: "/x/y", source: "env" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAddProjectRoot(), { wrapper: Wrapper });
    result.current.mutate("/x/y");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(DuplicateRootError);
    expect((result.current.error as DuplicateRootError).source).toBe("env");
  });

  it("throws InvalidRootPathError on 400", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "path is not a directory", path: "/etc/passwd" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAddProjectRoot(), { wrapper: Wrapper });
    result.current.mutate("/etc/passwd");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(InvalidRootPathError);
  });
});

describe("useDeleteProjectRoot", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("DELETEs by id and invalidates the projects list", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { Wrapper, client } = makeWrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeleteProjectRoot(), { wrapper: Wrapper });

    result.current.mutate(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/roots/7",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["projects", "list"] });
  });
});
