import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { DiffView } from "./DiffView";

vi.mock("@/components/MarkdownDiffEditor", () => ({
  MarkdownDiffEditor: ({ original, modified }: { original: string; modified: string }) => (
    <div data-testid="diff-editor">
      <pre data-testid="left">{original}</pre>
      <pre data-testid="right">{modified}</pre>
    </div>
  ),
}));

interface ScenarioFile {
  scope: string;
  path: string;
  status: number;
  body?: { content: string; path: string; mtime: number; frontmatter: Record<string, unknown> };
}

function setupFetch(files: ScenarioFile[], projects: Array<{ slug: string; name: string; absolutePath: string; hasClaudeDir: boolean; source: "env" | "user" }> = []) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("/api/projects")) {
      return new Response(JSON.stringify(projects), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("/api/rules/file")) {
      const u = new URL(url, "http://x");
      const path = u.searchParams.get("path") ?? "";
      const scope = u.searchParams.get("scope") ?? "global";
      const match = files.find((f) => f.scope === scope && f.path === path);
      if (!match) {
        return new Response(JSON.stringify({ error: "file not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(match.body ?? {}), {
        status: match.status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

function renderDiff(left: string, right: string, path: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const rootRoute = createRootRoute({
    component: () => <DiffView left={left} right={right} path={path} />,
  });
  const rules = createRoute({ getParentRoute: () => rootRoute, path: "/guarding/rules", component: () => null });
  const project = createRoute({ getParentRoute: () => rootRoute, path: "/projects/$slug", component: () => null });
  const router = createRouter({
    routeTree: rootRoute.addChildren([rules, project]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("DiffView", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the diff editor when both files are present", async () => {
    setupFetch([
      {
        scope: "global",
        path: "CLAUDE.md",
        status: 200,
        body: { content: "GLOBAL_BODY", path: "CLAUDE.md", mtime: 1, frontmatter: {} },
      },
      {
        scope: "alpha",
        path: "CLAUDE.md",
        status: 200,
        body: { content: "PROJECT_BODY", path: "CLAUDE.md", mtime: 1, frontmatter: {} },
      },
    ], [{ slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "env" }]);

    renderDiff("global", "alpha", "CLAUDE.md");

    expect(await screen.findByTestId("diff-editor")).toBeInTheDocument();
    expect(screen.getByTestId("left").textContent).toBe("GLOBAL_BODY");
    expect(screen.getByTestId("right").textContent).toBe("PROJECT_BODY");
    expect(screen.getByText("GLOBAL")).toBeInTheDocument();
    expect(screen.getByText("PROJECT · Alpha")).toBeInTheDocument();
  });

  it("shows a single-sided hint when one side is missing", async () => {
    setupFetch([
      {
        scope: "global",
        path: "CLAUDE.md",
        status: 200,
        body: { content: "GLOBAL_BODY", path: "CLAUDE.md", mtime: 1, frontmatter: {} },
      },
    ], [{ slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "env" }]);

    renderDiff("global", "alpha", "CLAUDE.md");

    expect(await screen.findByText(/PROJECT · Alpha has no file/)).toBeInTheDocument();
    expect(screen.queryByTestId("diff-editor")).not.toBeInTheDocument();
  });

  it("falls back to the slug as the label when the project list is empty", async () => {
    setupFetch([], []);
    renderDiff("global", "ghost", "CLAUDE.md");
    expect(await screen.findByText(/PROJECT · ghost/)).toBeInTheDocument();
  });
});
