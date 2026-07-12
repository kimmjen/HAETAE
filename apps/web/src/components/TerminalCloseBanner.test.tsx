import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { TerminalCloseBanner } from "./TerminalCloseBanner";

function renderBanner(code: number, reason: string) {
  const root = createRootRoute({
    component: () => <TerminalCloseBanner code={code} reason={reason} />,
  });
  const settings = createRoute({
    getParentRoute: () => root,
    path: "/settings",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([settings]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("TerminalCloseBanner", () => {
  it("renders the raw reason verbatim regardless of code", async () => {
    renderBanner(4400, "cwd must be absolute: ~/.claude");
    expect(await screen.findByText("cwd must be absolute: ~/.claude")).toBeInTheDocument();
  });

  it("4400 shows the invalid-cwd headline", async () => {
    renderBanner(4400, "cwd does not exist");
    expect(await screen.findByText("Invalid cwd")).toBeInTheDocument();
  });

  it("4403 shows the forbidden-cwd headline + Settings link", async () => {
    renderBanner(4403, "cwd not allowed: /etc");
    expect(await screen.findByText("cwd not allowed")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open Settings/ });
    expect(link).toHaveAttribute("href", "/settings");
  });

  it("4500 shows the PTY-spawn headline", async () => {
    renderBanner(4500, "pty spawn failed");
    expect(await screen.findByText("PTY failed to start")).toBeInTheDocument();
  });

  it("unknown 4xxx codes fall back to a generic headline with the code", async () => {
    renderBanner(4999, "weird thing");
    expect(await screen.findByText("Connection closed")).toBeInTheDocument();
    expect(screen.getByText(/4999/)).toBeInTheDocument();
  });
});
