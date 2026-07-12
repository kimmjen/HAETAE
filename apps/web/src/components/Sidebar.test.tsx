import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { CommandPaletteProvider } from "./command-palette";

const TEST_PATHS = [
  "/watching/overview",
  "/watching/local",
  "/watching/api",
  "/watching/unified",
  "/guarding/claude-md",
  "/guarding/rules",
  "/guarding/global-rules",
  "/guarding/skills",
  "/working/terminal",
  "/profile",
  "/settings",
] as const;

interface RenderOpts {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function renderSidebarAt(pathname: string, opts: RenderOpts = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });

  const rootRoute = createRootRoute({
    component: () => (
      <CommandPaletteProvider>
        <Sidebar mobileOpen={opts.mobileOpen} onMobileClose={opts.onMobileClose} />
        <Outlet />
      </CommandPaletteProvider>
    ),
  });

  const staticChildren = TEST_PATHS.map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => null,
    }),
  );

  const projectChild = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$slug",
    component: () => null,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([...staticChildren, projectChild]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function mockProjects(payload: Array<{ slug: string; name: string; absolutePath: string; hasClaudeDir: boolean }>) {
  globalThis.fetch = vi.fn(async (url) => {
    const u = typeof url === "string" ? url : (url as URL).toString();
    if (u.includes("/api/projects")) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("Sidebar", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockProjects([]);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the brand block and all section headers", async () => {
    renderSidebarAt("/watching/overview");
    expect(await screen.findByText("HAETAE")).toBeInTheDocument();
    expect(screen.getByText("Watching")).toBeInTheDocument();
    expect(screen.getByText("Guarding")).toBeInTheDocument();
    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });

  it("marks the active link with the accent background", async () => {
    renderSidebarAt("/watching/overview");
    const link = await screen.findByRole("link", { name: /Overview/i });
    expect(link.className).toContain("bg-accent");
  });

  it("does not mark unrelated links as active", async () => {
    renderSidebarAt("/watching/overview");
    const local = await screen.findByRole("link", { name: /Local Usage/i });
    expect(local.className).not.toContain("bg-accent");
  });

  it("Guarding section has Rules / Global Rules / Skills mapped to ADR 0007 routes", async () => {
    renderSidebarAt("/watching/overview");
    const rules = await screen.findByRole("link", { name: /^Rules$/i });
    const globalRules = await screen.findByRole("link", { name: /Global Rules/i });
    const skills = await screen.findByRole("link", { name: /^Skills$/i });
    expect(rules.getAttribute("href")).toBe("/guarding/rules");
    expect(globalRules.getAttribute("href")).toBe("/guarding/global-rules");
    expect(skills.getAttribute("href")).toBe("/guarding/skills");
  });

  it("Terminal nav points to /working/terminal (P3.2 went live)", async () => {
    renderSidebarAt("/watching/overview");
    const terminal = await screen.findByRole("link", { name: /Terminal/i });
    expect(terminal.getAttribute("href")).toBe("/working/terminal");
  });

  it("renders project entries from /api/projects", async () => {
    mockProjects([
      { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true },
      { slug: "beta-sim", name: "Beta-Sim", absolutePath: "/x/Beta-Sim", hasClaudeDir: true },
    ]);
    renderSidebarAt("/projects/alpha");
    const alpha = await screen.findByRole("link", { name: /Alpha/ });
    expect(alpha.getAttribute("href")).toBe("/projects/alpha");
    expect(alpha.className).toContain("bg-accent");
    expect(screen.getByRole("link", { name: /Beta-Sim/ })).toBeInTheDocument();
  });

  it("shows the empty hint when /api/projects returns []", async () => {
    mockProjects([]);
    renderSidebarAt("/watching/overview");
    expect(
      await screen.findByText(/HAETAE_PROJECT_ROOTS/),
    ).toBeInTheDocument();
  });

  it("dims a project that has no .claude directory", async () => {
    mockProjects([
      { slug: "empty", name: "Empty", absolutePath: "/x/Empty", hasClaudeDir: false },
    ]);
    renderSidebarAt("/watching/overview");
    const empty = await screen.findByRole("link", { name: /Empty/ });
    expect(empty.className).toContain("text-text-subtle");
    expect(empty.getAttribute("title")).toContain(".claude");
  });

  it("기본적으로 backdrop 안 그림 (mobileOpen=false)", async () => {
    renderSidebarAt("/watching/overview");
    await screen.findByText("HAETAE");
    expect(
      screen.queryByRole("button", { name: /close navigation/i }),
    ).not.toBeInTheDocument();
  });

  it("mobileOpen=true 일 때 backdrop 노출 + 클릭으로 onMobileClose 호출", async () => {
    const onMobileClose = vi.fn();
    renderSidebarAt("/watching/overview", { mobileOpen: true, onMobileClose });
    const backdrop = await screen.findByRole("button", { name: /close navigation/i });
    await userEvent.click(backdrop);
    expect(onMobileClose).toHaveBeenCalledTimes(1);
  });
});
