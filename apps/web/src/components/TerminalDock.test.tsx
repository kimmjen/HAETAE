import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardRef, useImperativeHandle } from "react";
import { TerminalDockProvider, useTerminalDock } from "./TerminalDock";

// Drive the dock's `visible` flag without a real router.
let mockPathname = "/working/terminal";
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useLocation: () => ({ pathname: mockPathname }),
}));

// Keep xterm/WebSocket out — surface autoCommand via a data attribute.
vi.mock("@/components/Terminal", () => ({
  Terminal: forwardRef<{ focus(): void; clear(): void; searchNext(): boolean; searchPrevious(): boolean }, { cwd?: string; autoCommand?: string }>(
    function TerminalStub({ cwd, autoCommand }, ref) {
      useImperativeHandle(ref, () => ({
        focus: () => {},
        clear: () => {},
        searchNext: () => true,
        searchPrevious: () => true,
      }));
      return <div data-testid="term-stub" data-cwd={cwd ?? ""} data-auto={autoCommand ?? ""} />;
    },
  ),
}));

function SpawnButton({ autoCommand }: { autoCommand: string }) {
  const dock = useTerminalDock();
  return (
    <button type="button" data-testid="spawn" onClick={() => dock.requestSpawn({ autoCommand })}>
      spawn
    </button>
  );
}

const countAuto = (auto: string) =>
  screen.getAllByTestId("term-stub").filter((el) => (el as HTMLElement).dataset.auto === auto).length;

describe("TerminalDock spawn dedup", () => {
  afterEach(() => {
    mockPathname = "/working/terminal";
    vi.clearAllMocks();
  });

  it("dedupes the same command within one visit but re-spawns after leaving the route", () => {
    const { rerender } = render(
      <TerminalDockProvider>
        <SpawnButton autoCommand="login-x" />
      </TerminalDockProvider>,
    );

    fireEvent.click(screen.getByTestId("spawn"));
    expect(countAuto("login-x")).toBe(1);

    // Same command again while still on the route → ignored (no extra tab).
    fireEvent.click(screen.getByTestId("spawn"));
    expect(countAuto("login-x")).toBe(1);

    // Leave the terminal route, come back, request the same command again.
    mockPathname = "/settings";
    rerender(
      <TerminalDockProvider>
        <SpawnButton autoCommand="login-x" />
      </TerminalDockProvider>,
    );
    mockPathname = "/working/terminal";
    rerender(
      <TerminalDockProvider>
        <SpawnButton autoCommand="login-x" />
      </TerminalDockProvider>,
    );

    fireEvent.click(screen.getByTestId("spawn"));
    expect(countAuto("login-x")).toBe(2);
  });
});
