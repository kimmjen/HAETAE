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
import { ProjectRulesView } from "./ProjectRulesView";

interface ProjectFixture {
  slug: string;
  name: string;
  absolutePath: string;
  hasClaudeDir: boolean;
  hasSession?: boolean;
}

function mockServer({
  projects,
  tree = [],
}: {
  projects: ProjectFixture[];
  tree?: unknown[];
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
      return new Response(JSON.stringify(tree), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

function renderProjectRules(slug: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });

  const rootRoute = createRootRoute({
    component: () => (
      <ProjectRulesView slug={slug} selectedPath={null} onSelect={() => undefined} />
    ),
  });
  const child = createRoute({
    getParentRoute: () => rootRoute,
    path: "/guarding/rules",
    component: () => null,
  });
  const terminal = createRoute({
    getParentRoute: () => rootRoute,
    path: "/working/terminal",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([child, terminal]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("ProjectRulesView", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the project header and the scoped rules tree when the project exists", async () => {
    mockServer({
      projects: [
        { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true },
      ],
      tree: [{ name: "CLAUDE.md", type: "file", path: "CLAUDE.md" }],
    });

    renderProjectRules("alpha");

    expect(await screen.findByText(/Project · Alpha/i)).toBeInTheDocument();
    expect(screen.getByText("/x/Alpha/.claude")).toBeInTheDocument();
  });

  it("shows an unknown-scope explainer when the slug has no matching project", async () => {
    mockServer({ projects: [] });
    renderProjectRules("ghost");
    expect(await screen.findByText(/Unknown project/i)).toBeInTheDocument();
    expect(screen.getByText(/ghost/)).toBeInTheDocument();
  });

  it("shows a no-.claude hint when the project exists but has no .claude/", async () => {
    mockServer({
      projects: [
        { slug: "empty", name: "Empty", absolutePath: "/x/Empty", hasClaudeDir: false },
      ],
    });
    renderProjectRules("empty");
    expect(await screen.findByText(/has no \.claude\//)).toBeInTheDocument();
    expect(screen.getByText("/x/Empty (no .claude/)")).toBeInTheDocument();
  });

  it("when hasSession=false renders only 'Claude Code' (new session, no Continue)", async () => {
    mockServer({
      projects: [
        { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, hasSession: false },
      ],
    });
    renderProjectRules("alpha");
    const claudeLink = await screen.findByRole("link", { name: /Claude Code/i });
    expect(claudeLink.getAttribute("href")).toContain("autoCommand=claude");
    expect(claudeLink.getAttribute("href")).not.toContain("--continue");
    expect(screen.queryByRole("link", { name: /^Continue$/i })).toBeNull();
  });

  it("when hasSession=true renders BOTH Continue and Claude Code (new) side by side", async () => {
    mockServer({
      projects: [
        { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, hasSession: true },
      ],
    });
    renderProjectRules("alpha");
    const continueLink = await screen.findByRole("link", { name: /Continue/i });
    expect(continueLink.getAttribute("href")).toContain("autoCommand=claude+--continue");
    const claudeLink = screen.getByRole("link", { name: /Claude Code/i });
    expect(claudeLink.getAttribute("href")).toContain("autoCommand=claude");
    expect(claudeLink.getAttribute("href")).not.toContain("--continue");
  });
});
