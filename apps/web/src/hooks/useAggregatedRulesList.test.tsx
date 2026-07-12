import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAggregatedRulesList } from "./useAggregatedRulesList";

interface ProjectFixture {
  slug: string;
  name: string;
  absolutePath: string;
  hasClaudeDir: boolean;
  source: "env" | "user";
}

interface ScopeTree {
  scope: string;
  category?: string;
  tree: unknown[];
}

function setupFetch(projects: ProjectFixture[], scopeTrees: ScopeTree[]) {
  const seen: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    seen.push(url);
    if (url.startsWith("/api/projects")) {
      return new Response(JSON.stringify(projects), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("/api/rules/list")) {
      const u = new URL(url, "http://x");
      const scope = u.searchParams.get("scope") ?? "global";
      const category = u.searchParams.get("category") ?? undefined;
      const match = scopeTrees.find(
        (s) => s.scope === scope && s.category === category,
      );
      return new Response(JSON.stringify(match?.tree ?? []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return seen;
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useAggregatedRulesList", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("includeGlobal=false returns one section per project, no global", async () => {
    setupFetch(
      [
        { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "env" },
        { slug: "beta", name: "Beta", absolutePath: "/x/Beta", hasClaudeDir: true, source: "env" },
      ],
      [
        { scope: "alpha", category: "rules", tree: [{ name: "CLAUDE.md", type: "file", path: "CLAUDE.md" }] },
        { scope: "beta", category: "rules", tree: [] },
      ],
    );

    const { result } = renderHook(
      () => useAggregatedRulesList({ category: "rules", includeGlobal: false }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.sections).toHaveLength(2);
      expect(result.current.sections.every((s) => !s.isPending)).toBe(true);
    });

    expect(result.current.sections.map((s) => s.origin.kind)).toEqual(["project", "project"]);
    expect(result.current.sections.map((s) => s.origin.label)).toEqual(["Alpha", "Beta"]);
  });

  it("includeGlobal=true puts the global section first with kind='global'", async () => {
    setupFetch(
      [
        { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "env" },
      ],
      [
        { scope: "global", category: "skills", tree: [{ name: "skills", type: "directory", path: "skills", children: [{ name: "g.md", type: "file", path: "skills/g.md" }] }] },
        { scope: "alpha", category: "skills", tree: [] },
      ],
    );

    const { result } = renderHook(
      () => useAggregatedRulesList({ category: "skills", includeGlobal: true }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.sections).toHaveLength(2);
      expect(result.current.sections.every((s) => !s.isPending)).toBe(true);
    });

    expect(result.current.sections[0]?.origin.kind).toBe("global");
    expect(result.current.sections[0]?.origin.label).toBe("GLOBAL");
    expect(result.current.sections[1]?.origin.kind).toBe("project");
  });

  it("flags projects that have no .claude/ via origin.missing", async () => {
    setupFetch(
      [
        { slug: "empty", name: "Empty", absolutePath: "/x/Empty", hasClaudeDir: false, source: "env" },
      ],
      [{ scope: "empty", category: "rules", tree: [] }],
    );

    const { result } = renderHook(
      () => useAggregatedRulesList({ category: "rules", includeGlobal: false }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.sections).toHaveLength(1);
    });

    expect(result.current.sections[0]?.origin.missing).toBe(true);
  });

  it("propagates the category in the per-scope URL", async () => {
    const seen = setupFetch(
      [{ slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "env" }],
      [],
    );
    renderHook(
      () => useAggregatedRulesList({ category: "skills", includeGlobal: true }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(seen.some((u) => u === "/api/rules/list?category=skills")).toBe(true);
      expect(seen.some((u) => u === "/api/rules/list?scope=alpha&category=skills")).toBe(true);
    });
  });
});
