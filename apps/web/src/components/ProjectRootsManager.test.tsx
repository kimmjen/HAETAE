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
import { Toaster } from "sonner";
import { ProjectRootsManager } from "./ProjectRootsManager";

interface ProjectFixture {
  slug: string;
  name: string;
  absolutePath: string;
  hasClaudeDir: boolean;
  source: "env" | "user";
  id?: number;
}

let currentProjects: ProjectFixture[] = [];
let postCalls: Array<{ url: string; body: string }> = [];

function setupFetch() {
  postCalls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (method === "GET" && url.startsWith("/api/projects")) {
      return new Response(JSON.stringify(currentProjects), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "POST" && url === "/api/projects/roots") {
      postCalls.push({ url, body: String(init?.body ?? "") });
      const body = JSON.parse(String(init?.body ?? "{}"));
      return new Response(
        JSON.stringify({ id: 99, absolutePath: body.absolutePath, addedAt: "2026-05-03T00:00:00Z" }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

function renderManager() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  const root = createRootRoute({
    component: () => (
      <>
        <ProjectRootsManager />
        <Toaster />
      </>
    ),
  });
  const terminal = createRoute({
    getParentRoute: () => root,
    path: "/working/terminal",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([terminal]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("ProjectRootsManager", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    currentProjects = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders empty-state copy when no roots are registered", async () => {
    setupFetch();
    renderManager();
    expect(await screen.findByText("No project roots registered.")).toBeInTheDocument();
  });

  it("renders one row per project with the right badge + terminal link", async () => {
    currentProjects = [
      { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "user", id: 1 },
      { slug: "old", name: "Legacy", absolutePath: "/x/Legacy", hasClaudeDir: false, source: "env" },
    ];
    setupFetch();
    renderManager();
    expect(await screen.findByText("/x/Alpha")).toBeInTheDocument();
    expect(screen.getByText("/x/Legacy")).toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: /Open terminal at/i });
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute("href")).toContain("cwd=%2Fx%2FAlpha");
  });

  it("submits the input via POST /api/projects/roots on click", async () => {
    setupFetch();
    const user = userEvent.setup();
    renderManager();
    await screen.findByText("No project roots registered.");

    const input = screen.getByPlaceholderText("/Users/me/Documents/GitHub/MyProject");
    await user.type(input, "/Users/me/Documents/GitHub/X");
    await user.click(screen.getByRole("button", { name: /^Add$/i }));

    expect(postCalls).toHaveLength(1);
    expect(JSON.parse(postCalls[0]!.body)).toEqual({
      absolutePath: "/Users/me/Documents/GitHub/X",
    });
  });

  it("Enter key in the input also submits", async () => {
    setupFetch();
    const user = userEvent.setup();
    renderManager();
    await screen.findByText("No project roots registered.");
    const input = screen.getByPlaceholderText("/Users/me/Documents/GitHub/MyProject");
    await user.type(input, "/Users/me/Documents/GitHub/Y{Enter}");
    expect(postCalls).toHaveLength(1);
  });
});
