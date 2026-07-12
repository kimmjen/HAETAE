import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TerminalTabBar, type TerminalTabDescriptor } from "./TerminalTabBar";

const tabs: TerminalTabDescriptor[] = [
  { id: "a", label: "Alpha", status: "open" },
  { id: "b", label: "WORK", status: "connecting" },
];

function renderBar(overrides: Partial<React.ComponentProps<typeof TerminalTabBar>> = {}) {
  const props = {
    tabs,
    activeId: "a",
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onAdd: vi.fn(),
    onContextMenu: vi.fn(),
    ...overrides,
  };
  render(<TerminalTabBar {...props} />);
  return props;
}

describe("TerminalTabBar", () => {
  it("renders one tab per descriptor with active selection", () => {
    renderBar();
    const tabEls = screen.getAllByRole("tab");
    expect(tabEls).toHaveLength(2);
    expect(tabEls[0]).toHaveAttribute("aria-selected", "true");
    expect(tabEls[1]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect with the tab id when a tab is clicked", () => {
    const props = renderBar();
    fireEvent.click(screen.getAllByRole("tab")[1]!);
    expect(props.onSelect).toHaveBeenCalledWith("b");
  });

  it("calls onClose without bubbling to onSelect when × is clicked", () => {
    const props = renderBar();
    fireEvent.click(screen.getByLabelText("Close WORK"));
    expect(props.onClose).toHaveBeenCalledWith("b");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("calls onAdd when the + button is clicked", () => {
    const props = renderBar();
    fireEvent.click(screen.getByLabelText("New terminal tab"));
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  it("calls onContextMenu with id and pointer coords on right-click", () => {
    const props = renderBar();
    fireEvent.contextMenu(screen.getAllByRole("tab")[0]!, { clientX: 42, clientY: 99 });
    expect(props.onContextMenu).toHaveBeenCalledWith("a", 42, 99);
  });

  it("renders status dots with semantic aria-labels per state", () => {
    renderBar();
    expect(screen.getByLabelText("Connected")).toBeInTheDocument();
    expect(screen.getByLabelText("Connecting")).toBeInTheDocument();
  });
});
