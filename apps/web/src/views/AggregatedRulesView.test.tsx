import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { AggregatedRulesView } from "./AggregatedRulesView";

vi.mock("@/components/MarkdownEditor", () => ({
  MarkdownEditor: ({ value }: { value: string }) => (
    <textarea data-testid="markdown-editor" defaultValue={value} />
  ),
}));

interface ProjectFixture {
  slug: string;
  name: string;
  absolutePath: string;
  hasClaudeDir: boolean;
  source: "env" | "user";
}

interface ScopeTree {
  scope: string;
  tree: unknown[];
}

interface ScopeFile {
  scope: string;
  path: string;
  content: string;
  mtime?: number;
  frontmatter?: Record<string, unknown>;
}

function setupFetch({
  projects = [],
  trees = [],
  files = [],
}: {
  projects?: ProjectFixture[];
  trees?: ScopeTree[];
  files?: ScopeFile[];
}) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("/api/projects")) {
      return new Response(JSON.stringify(projects), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("/api/rules/list")) {
      const u = new URL(url, "http://x");
      const scope = u.searchParams.get("scope") ?? "global";
      const match = trees.find((t) => t.scope === scope);
      return new Response(JSON.stringify(match?.tree ?? []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("/api/rules/file")) {
      const u = new URL(url, "http://x");
      const scope = u.searchParams.get("scope") ?? "global";
      const path = u.searchParams.get("path") ?? "";
      const match = files.find((f) => f.scope === scope && f.path === path);
      if (!match) {
        return new Response(JSON.stringify({ error: "file not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          path,
          content: match.content,
          frontmatter: match.frontmatter ?? {},
          mtime: match.mtime ?? 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

function renderView(props: Parameters<typeof AggregatedRulesView>[0]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute({
    component: () => <AggregatedRulesView {...props} />,
  });
  const skillNew = createRoute({
    getParentRoute: () => rootRoute,
    path: "/guarding/skills/new",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([skillNew]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("AggregatedRulesView", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders one section per project (no global) when includeGlobal=false", async () => {
    setupFetch({
      projects: [
        { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "env" },
        { slug: "beta", name: "Beta", absolutePath: "/x/Beta", hasClaudeDir: true, source: "env" },
      ],
      trees: [
        { scope: "alpha", tree: [{ name: "CLAUDE.md", type: "file", path: "CLAUDE.md" }] },
        { scope: "beta", tree: [] },
      ],
    });

    renderView({
      title: "Rules",
      emptyMessage: "비어있음",
      category: "rules",
      includeGlobal: false,
    });

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    // The two project sections render PROJECT badges
    expect(screen.getAllByText("PROJECT").length).toBe(2);
    expect(screen.queryByText("GLOBAL")).not.toBeInTheDocument();
  });

  it("renders the GLOBAL section first when includeGlobal=true", async () => {
    setupFetch({
      projects: [
        { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "env" },
      ],
      trees: [
        { scope: "global", tree: [{ name: "skills", type: "directory", path: "skills", children: [{ name: "g.md", type: "file", path: "skills/g.md" }] }] },
        { scope: "alpha", tree: [] },
      ],
    });

    renderView({
      title: "Skills",
      emptyMessage: "비어있음",
      category: "skills",
      includeGlobal: true,
    });

    expect(await screen.findByText("GLOBAL")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("selecting a file fetches it from the right scope and shows the editor with that origin's badge", async () => {
    setupFetch({
      projects: [
        { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "env" },
      ],
      trees: [
        { scope: "alpha", tree: [{ name: "CLAUDE.md", type: "file", path: "CLAUDE.md" }] },
      ],
      files: [{ scope: "alpha", path: "CLAUDE.md", content: "Alpha_RULES" }],
    });

    renderView({
      title: "Rules",
      emptyMessage: "비어있음",
      category: "rules",
      includeGlobal: false,
    });

    const user = userEvent.setup();
    const fileBtn = await screen.findByRole("button", { name: /CLAUDE\.md/i });
    await user.click(fileBtn);

    const editor = await screen.findByTestId("markdown-editor");
    expect(editor).toHaveValue("Alpha_RULES");
    // Header shows the Alpha badge for the selected scope
    expect(screen.getAllByText("Alpha").length).toBeGreaterThanOrEqual(1);
  });

  it("hides the empty-state action when at least one section has files", async () => {
    setupFetch({
      projects: [
        { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "env" },
      ],
      trees: [{ scope: "alpha", tree: [{ name: "CLAUDE.md", type: "file", path: "CLAUDE.md" }] }],
    });

    renderView({
      title: "Rules",
      emptyMessage: "ROUTE_EMPTY_MESSAGE",
      category: "rules",
      includeGlobal: false,
    });

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("ROUTE_EMPTY_MESSAGE")).not.toBeInTheDocument();
  });

  it("shows the empty-state message when no scope has files", async () => {
    setupFetch({
      projects: [
        { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "env" },
      ],
      trees: [{ scope: "alpha", tree: [] }],
    });

    renderView({
      title: "Rules",
      emptyMessage: "ROUTE_EMPTY_MESSAGE",
      category: "rules",
      includeGlobal: false,
    });

    expect(await screen.findByText("ROUTE_EMPTY_MESSAGE")).toBeInTheDocument();
  });
});
