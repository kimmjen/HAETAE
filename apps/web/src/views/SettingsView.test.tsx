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
import { SettingsView } from "./SettingsView";

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
let deleteCalls: Array<{ url: string }> = [];

function setupFetch(opts?: { addStatus?: number; addBody?: unknown; deleteStatus?: number }) {
  postCalls = [];
  deleteCalls = [];
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
      const status = opts?.addStatus ?? 201;
      const body = opts?.addBody ?? { id: 99, absolutePath: JSON.parse(String(init?.body ?? "{}")).absolutePath };
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "DELETE" && url.startsWith("/api/projects/roots/")) {
      deleteCalls.push({ url });
      return new Response(null, { status: opts?.deleteStatus ?? 204 });
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

function renderSettings() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  // SettingsView renders TanStack Router <Link>s for the per-row "Open
  // terminal" buttons, which need a router context. A minimal in-memory
  // router with stub child routes covers it.
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <SettingsView />
        <Toaster />
      </>
    ),
  });
  const terminalRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/working/terminal",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([terminalRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("SettingsView — Project Roots", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    currentProjects = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders ENV and USER rows with correct badges", async () => {
    currentProjects = [
      { slug: "alpha", name: "Alpha", absolutePath: "/x/Alpha", hasClaudeDir: true, source: "env" },
      { slug: "user", name: "UserProj", absolutePath: "/x/UserProj", hasClaudeDir: false, source: "user", id: 7 },
    ];
    setupFetch();

    renderSettings();

    expect(await screen.findByText("/x/Alpha")).toBeInTheDocument();
    expect(screen.getByText("/x/UserProj")).toBeInTheDocument();
    expect(screen.getByText("env")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByText(".claude/ ✓")).toBeInTheDocument();
    expect(screen.getByText(".claude/ missing")).toBeInTheDocument();

    // ENV row's delete button is disabled, USER row's is enabled.
    const buttons = screen.getAllByRole("button", { name: /Remove \/x\// });
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();

    // Each row has an "Open terminal" link pointing at /working/terminal
    // with the row's absolutePath as cwd.
    const links = screen.getAllByRole("link", { name: /Open terminal at/i });
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute("href")).toContain("/working/terminal");
    expect(links[0]!.getAttribute("href")).toContain("cwd=%2Fx%2FAlpha");
    expect(links[1]!.getAttribute("href")).toContain("cwd=%2Fx%2FUserProj");
  });

  it("Add posts the path and clears the input on success", async () => {
    setupFetch();
    renderSettings();
    const user = userEvent.setup();

    const input = await screen.findByPlaceholderText(/Documents\/GitHub/i);
    await user.type(input, "/x/NewProj");
    await user.click(screen.getByRole("button", { name: /^add/i }));

    expect(postCalls).toHaveLength(1);
    expect(JSON.parse(postCalls[0]!.body)).toEqual({ absolutePath: "/x/NewProj" });
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("shows a duplicate-source toast when the server replies 409", async () => {
    setupFetch({
      addStatus: 409,
      addBody: { path: "/x/Alpha", source: "env" },
    });
    renderSettings();
    const user = userEvent.setup();

    const input = await screen.findByPlaceholderText(/Documents\/GitHub/i);
    await user.type(input, "/x/Alpha");
    await user.click(screen.getByRole("button", { name: /^add/i }));

    expect(await screen.findByText(/Already registered/i)).toBeInTheDocument();
  });

  it("clicking Remove on a USER row opens ConfirmDialog and DELETEs on confirm", async () => {
    currentProjects = [
      { slug: "user", name: "UserProj", absolutePath: "/x/UserProj", hasClaudeDir: true, source: "user", id: 7 },
    ];
    setupFetch();
    renderSettings();
    const user = userEvent.setup();

    await screen.findByText("/x/UserProj");
    await user.click(screen.getByRole("button", { name: /Remove \/x\/UserProj/ }));

    expect(await screen.findByText(/Remove project root/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^remove$/i }));

    expect(deleteCalls).toEqual([{ url: "/api/projects/roots/7" }]);
  });
});

describe("SettingsView — master/detail nav", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    currentProjects = [];
    setupFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("좌측 리스트에 모든 섹션이 보이고, 기본은 프로젝트 루트 상세", async () => {
    renderSettings();
    // 라우터 마운트는 비동기 — 첫 쿼리는 await
    expect(await screen.findByRole("button", { name: /프로젝트 루트/ })).toBeInTheDocument();
    for (const label of ["Cost Thresholds", "Display Currency", "API Key"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    // 기본 선택 = 프로젝트 루트 → 추가 입력란이 우측에 렌더
    expect(await screen.findByPlaceholderText(/Documents\/GitHub/i)).toBeInTheDocument();
  });

  it("표시 통화 클릭 시 우측에 통화 패널 (실시간 환율) 이 뜬다", async () => {
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /표시 통화/ }));

    expect(await screen.findByText(/Live Rate/)).toBeInTheDocument();
    expect(screen.getByText(/1 USD = ₩/)).toBeInTheDocument();
    // 프로젝트 루트 상세는 더 이상 안 보임
    expect(screen.queryByPlaceholderText(/Documents\/GitHub/i)).not.toBeInTheDocument();
  });

  it("비용 임계치 클릭 시 임계치 패널로 전환", async () => {
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /비용 임계치/ }));

    expect(await screen.findByText(/Cost Thresholds \(USD\)/)).toBeInTheDocument();
  });
});
