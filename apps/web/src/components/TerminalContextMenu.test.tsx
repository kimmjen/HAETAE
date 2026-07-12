import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TerminalContextMenu, clampMenuPosition } from "./TerminalContextMenu";

function renderMenu(overrides: Partial<React.ComponentProps<typeof TerminalContextMenu>> = {}) {
  const props = {
    x: 10,
    y: 20,
    hasSiblings: true,
    onAction: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<TerminalContextMenu {...props} />);
  return props;
}

describe("TerminalContextMenu", () => {
  it("renders the three close actions as menu items", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: "Close tab" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Close others" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Close all" })).toBeInTheDocument();
  });

  it("disables 'Close others' when there are no siblings", () => {
    renderMenu({ hasSiblings: false });
    expect(screen.getByRole("menuitem", { name: "Close others" })).toBeDisabled();
  });

  it("invokes onAction with the matching action key", () => {
    const props = renderMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Close others" }));
    expect(props.onAction).toHaveBeenCalledWith("close-others");
  });

  it("dismisses on outside mousedown but not on inside click", () => {
    const props = renderMenu();
    fireEvent.mouseDown(screen.getByRole("menuitem", { name: "Close tab" }));
    expect(props.onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape", () => {
    const props = renderMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("clampMenuPosition", () => {
  it("keeps coordinates inside the viewport with a small margin", () => {
    const original = { w: window.innerWidth, h: window.innerHeight };
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });

    const inside = clampMenuPosition(100, 100, 180, 96);
    expect(inside).toEqual({ x: 100, y: 100 });

    const offRight = clampMenuPosition(950, 100, 180, 96);
    expect(offRight.x).toBe(1000 - 180 - 4);

    const offBottom = clampMenuPosition(100, 780, 180, 96);
    expect(offBottom.y).toBe(800 - 96 - 4);

    const negative = clampMenuPosition(-50, -50);
    expect(negative).toEqual({ x: 0, y: 0 });

    Object.defineProperty(window, "innerWidth", { configurable: true, value: original.w });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: original.h });
  });
});
