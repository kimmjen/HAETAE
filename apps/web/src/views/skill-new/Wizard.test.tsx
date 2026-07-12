import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { SkillWizard } from "./Wizard";

function renderWizard() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const wizardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/guarding/skills/new",
    component: SkillWizard,
  });
  const rulesStub = createRoute({
    getParentRoute: () => rootRoute,
    path: "/guarding/rules",
    component: () => null,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([wizardRoute, rulesStub]),
    history: createMemoryHistory({ initialEntries: ["/guarding/skills/new"] }),
  });

  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("SkillWizard", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("starts on the Basics step with the skills directory selected", async () => {
    renderWizard();
    expect(await screen.findByPlaceholderText("commit-helper")).toBeInTheDocument();
    const skillsButton = screen.getByRole("button", { name: "skills/" });
    expect(skillsButton.className).toContain("bg-accent");
  });

  it("blocks Next while Basics fields fail validation", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByPlaceholderText("commit-helper");
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText(/Enter a name/)).toBeInTheDocument();
  });

  it("stays on the Basics step when name fails the regex", async () => {
    const user = userEvent.setup();
    renderWizard();
    const nameInput = await screen.findByPlaceholderText("commit-helper");
    await user.type(nameInput, "Bad Name");
    await user.type(screen.getByPlaceholderText(/What this skill does/), "ok");
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText(/Lowercase letters/)).toBeInTheDocument();
    // still on Basics
    expect(screen.getByPlaceholderText("commit-helper")).toBeInTheDocument();
  });

  it("Cancel on a clean form navigates immediately without a dialog", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByPlaceholderText("commit-helper");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/Discard changes/i)).not.toBeInTheDocument();
  });

  it("Cancel with dirty form opens ConfirmDialog and stays put on Keep editing", async () => {
    const user = userEvent.setup();
    renderWizard();
    const nameInput = await screen.findByPlaceholderText("commit-helper");
    await user.type(nameInput, "x");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(await screen.findByText(/Discard changes/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(screen.getByPlaceholderText("commit-helper")).toBeInTheDocument();
  });

  it("walks through all three steps and POSTs the assembled file", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ path: "skills/commit.md", content: "", frontmatter: {}, mtime: 1 }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const user = userEvent.setup();
    renderWizard();
    await screen.findByPlaceholderText("commit-helper");

    await user.type(screen.getByPlaceholderText("commit-helper"), "commit");
    await user.type(
      screen.getByPlaceholderText(/What this skill does/),
      "Help write commits",
    );
    await user.click(screen.getByRole("button", { name: /next/i }));

    await screen.findByText("disable-model-invocation");
    const userInvocable = await screen.findByRole("checkbox", { name: /user-invocable/i });
    await user.click(userInvocable);
    await user.click(screen.getByRole("button", { name: /next/i }));

    await screen.findByText(/Body \(markdown\)/i);
    await user.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("/api/rules/file");
    const body = JSON.parse(call[1].body as string);
    expect(body.path).toBe("skills/commit.md");
    expect(body.content).toContain(`name: "commit"`);
    expect(body.content).toContain(`description: "Help write commits"`);
    expect(body.content).toContain("user-invocable: true");
  });
});
