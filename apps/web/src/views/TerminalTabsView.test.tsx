import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forwardRef, useImperativeHandle } from "react";

// Stub the Terminal so the view tests don't drag xterm/WebSocket in.
// We expose the cwd via data attribute so we can sanity-check what the
// view passes through, and forwardRef so the parent's ref(handle) =>
// setHandle wiring receives a real handle to drive in hotkey tests.
const clearCalls: string[] = [];
const focusCalls: string[] = [];

vi.mock("@/components/Terminal", () => ({
  Terminal: forwardRef<
    { focus(): void; clear(): void; searchNext(q: string): boolean; searchPrevious(q: string): boolean },
    {
      cwd?: string;
      autoCommand?: string;
      onStatusChange?: (s: "connecting" | "open" | "closed" | "error") => void;
    }
  >(function TerminalStub({ cwd, autoCommand, onStatusChange }, ref) {
    useImperativeHandle(
      ref,
      () => ({
        focus: () => focusCalls.push(cwd ?? ""),
        clear: () => clearCalls.push(cwd ?? ""),
        searchNext: () => true,
        searchPrevious: () => true,
      }),
      [cwd],
    );
    return (
      <div data-testid="term-stub" data-cwd={cwd ?? ""} data-auto={autoCommand ?? ""}>
        <button
          type="button"
          data-testid={`set-open-${cwd ?? "none"}`}
          onClick={() => onStatusChange?.("open")}
        >
          open
        </button>
      </div>
    );
  }),
}));

let xtermFocusedReturn = false;
vi.mock("@/hooks/useXtermFocus", () => ({
  useXtermFocus: () => xtermFocusedReturn,
}));

import { TerminalTabsView } from "./TerminalTabsView";

function dispatchHotkey(key: string, opts: { shift?: boolean } = {}) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        metaKey: true,
        shiftKey: opts.shift ?? false,
        bubbles: true,
      }),
    );
  });
}

describe("TerminalTabsView", () => {
  beforeEach(() => {
    clearCalls.length = 0;
    focusCalls.length = 0;
    xtermFocusedReturn = false;
  });

  afterEach(() => {
    xtermFocusedReturn = false;
  });

  it("renders the initial tab using initialCwd as the label and the Terminal cwd", () => {
    render(<TerminalTabsView initialCwd="/Users/me/projects/Alpha" />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toHaveTextContent("Alpha");
    expect(screen.getByTestId("term-stub")).toHaveAttribute("data-cwd", "/Users/me/projects/Alpha");
  });

  it("adds a new tab and switches to it on +", () => {
    render(<TerminalTabsView initialCwd="/x/Alpha" />);
    fireEvent.click(screen.getByLabelText("New terminal tab"));
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
  });

  it("keeps inactive tabs mounted (display: none) so PTY state survives switches", () => {
    render(<TerminalTabsView initialCwd="/x/Alpha" />);
    fireEvent.click(screen.getByLabelText("New terminal tab"));
    // Both Terminal stubs are mounted; one wrapper is hidden.
    const stubs = screen.getAllByTestId("term-stub");
    expect(stubs).toHaveLength(2);
    const wrappers = stubs.map((el) => el.parentElement!);
    const hidden = wrappers.filter((w) => w.className.includes("hidden"));
    expect(hidden).toHaveLength(1);
  });

  it("closes a tab via the × button and falls back to a neighbour", () => {
    render(<TerminalTabsView initialCwd="/x/Alpha" />);
    fireEvent.click(screen.getByLabelText("New terminal tab"));
    expect(screen.getAllByRole("tab")).toHaveLength(2);

    // Close the second (active) tab → first becomes active.
    const closes = screen.getAllByLabelText(/^Close /);
    fireEvent.click(closes[closes.length - 1]!);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveTextContent("Alpha");
  });

  it("shows the empty state after closing every tab", () => {
    render(<TerminalTabsView initialCwd="/x/Alpha" />);
    fireEvent.click(screen.getAllByLabelText(/^Close /)[0]!);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /open new terminal/i })).toBeInTheDocument();
  });

  it("opens the context menu on right-click and closes others", () => {
    render(<TerminalTabsView initialCwd="/x/Alpha" />);
    fireEvent.click(screen.getByLabelText("New terminal tab"));
    fireEvent.click(screen.getByLabelText("New terminal tab"));
    expect(screen.getAllByRole("tab")).toHaveLength(3);

    // Right-click the first tab.
    fireEvent.contextMenu(screen.getAllByRole("tab")[0]!, { clientX: 10, clientY: 10 });
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Close others" }));

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toHaveTextContent("Alpha");
  });

  it("propagates Terminal status into the tab's status dot", () => {
    render(<TerminalTabsView initialCwd="/x/Alpha" />);
    // Initial status is connecting.
    expect(screen.getByLabelText("Connecting")).toBeInTheDocument();
    // Stub flips status to "open".
    fireEvent.click(screen.getByTestId("set-open-/x/Alpha"));
    expect(screen.getByLabelText("Connected")).toBeInTheDocument();
  });

  describe("VS Code hotkeys", () => {
    it("Cmd+T adds a new tab and selects it", () => {
      render(<TerminalTabsView initialCwd="/x/Alpha" />);
      dispatchHotkey("t");
      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(2);
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    });

    it("Cmd+Shift+` is a browser-safe alias for new tab", () => {
      // Cmd+T is OS-reserved by macOS/Windows browsers — JS never sees
      // it. The alias matches VS Code's 'Create New Terminal' chord and
      // lets browser users actually trigger the action.
      render(<TerminalTabsView initialCwd="/x/Alpha" />);
      dispatchHotkey("`", { shift: true });
      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(2);
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    });

    it("Cmd+W closes the active tab", () => {
      render(<TerminalTabsView initialCwd="/x/Alpha" />);
      dispatchHotkey("t");
      expect(screen.getAllByRole("tab")).toHaveLength(2);
      dispatchHotkey("w");
      expect(screen.getAllByRole("tab")).toHaveLength(1);
    });

    it("Cmd+1..9 selects the Nth tab", () => {
      render(<TerminalTabsView initialCwd="/x/Alpha" />);
      dispatchHotkey("t");
      dispatchHotkey("t");
      // Three tabs, third active. Cmd+1 → first.
      dispatchHotkey("1");
      expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
      dispatchHotkey("3");
      expect(screen.getAllByRole("tab")[2]).toHaveAttribute("aria-selected", "true");
    });

    it("Cmd+Shift+]/[ cycles forward and backward through tabs", () => {
      render(<TerminalTabsView initialCwd="/x/Alpha" />);
      dispatchHotkey("t");
      dispatchHotkey("t");
      // index 2 active. Forward wraps to 0.
      dispatchHotkey("]", { shift: true });
      expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
      // Backward wraps to last.
      dispatchHotkey("[", { shift: true });
      expect(screen.getAllByRole("tab")[2]).toHaveAttribute("aria-selected", "true");
    });

    it("Cmd+F opens the search bar; Escape closes it", () => {
      render(<TerminalTabsView initialCwd="/x/Alpha" />);
      dispatchHotkey("f");
      const search = screen.getByRole("search", { name: /search terminal/i });
      expect(search).toBeInTheDocument();
      const input = within(search).getByLabelText("Search query");
      fireEvent.keyDown(input, { key: "Escape" });
      expect(screen.queryByRole("search", { name: /search terminal/i })).toBeNull();
    });

    it("Cmd+K clears the active terminal when xterm is focused", () => {
      xtermFocusedReturn = true;
      render(<TerminalTabsView initialCwd="/x/Alpha" />);
      dispatchHotkey("k");
      expect(clearCalls).toEqual(["/x/Alpha"]);
    });

    it("Cmd+K is a no-op in the view when xterm is not focused", () => {
      xtermFocusedReturn = false;
      render(<TerminalTabsView initialCwd="/x/Alpha" />);
      dispatchHotkey("k");
      expect(clearCalls).toEqual([]);
    });
  });

  describe("URL search params (P3.5)", () => {
    it("seeds the first tab with initialCwd + initialAutoCommand", () => {
      render(<TerminalTabsView initialCwd="/x/Alpha" initialAutoCommand="claude" />);
      const term = screen.getByTestId("term-stub");
      expect(term).toHaveAttribute("data-cwd", "/x/Alpha");
      expect(term).toHaveAttribute("data-auto", "claude");
    });

    it("opens a new tab when navigation changes the URL search params", () => {
      const { rerender } = render(<TerminalTabsView initialCwd="/x/Alpha" />);
      expect(screen.getAllByRole("tab")).toHaveLength(1);
      rerender(<TerminalTabsView initialCwd="/y/Other" initialAutoCommand="claude --resume X" />);
      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(2);
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
      // Newly spawned Terminal carries both fields.
      const stubs = screen.getAllByTestId("term-stub");
      const last = stubs[stubs.length - 1]!;
      expect(last).toHaveAttribute("data-cwd", "/y/Other");
      expect(last).toHaveAttribute("data-auto", "claude --resume X");
    });

    it("does not spawn anything when both params clear (e.g. URL reset)", () => {
      const { rerender } = render(
        <TerminalTabsView initialCwd="/x/Alpha" initialAutoCommand="claude" />,
      );
      expect(screen.getAllByRole("tab")).toHaveLength(1);
      rerender(<TerminalTabsView initialCwd={undefined} initialAutoCommand={undefined} />);
      expect(screen.getAllByRole("tab")).toHaveLength(1);
    });

    it("does not double-spawn when the same URL is re-applied", () => {
      const { rerender } = render(
        <TerminalTabsView initialCwd="/x/Alpha" initialAutoCommand="claude" />,
      );
      expect(screen.getAllByRole("tab")).toHaveLength(1);
      rerender(<TerminalTabsView initialCwd="/x/Alpha" initialAutoCommand="claude" />);
      expect(screen.getAllByRole("tab")).toHaveLength(1);
    });
  });
});
