import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileExistsError, useCreateFile } from "./useCreateFile";

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

describe("useCreateFile", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POSTs the body and returns the new file payload", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          path: "skills/new.md",
          content: "x",
          frontmatter: { name: "x" },
          mtime: 1,
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateFile(), { wrapper: Wrapper });

    result.current.mutate({ path: "skills/new.md", content: "---\nname: x\n---\nx" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.path).toBe("skills/new.md");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rules/file",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws FileExistsError on 409", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("conflict", { status: 409 }),
    ) as unknown as typeof fetch;

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateFile(), { wrapper: Wrapper });
    result.current.mutate({ path: "skills/dup.md", content: "x" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(FileExistsError);
  });

  it("invalidates the list query and seeds the file query on success", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ path: "rules/y.md", content: "v", frontmatter: {}, mtime: 1 }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const { Wrapper, client } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const setSpy = vi.spyOn(client, "setQueryData");

    const { result } = renderHook(() => useCreateFile(), { wrapper: Wrapper });
    result.current.mutate({ path: "rules/y.md", content: "v" });

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
