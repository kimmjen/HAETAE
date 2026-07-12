import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileTree } from "./FileTree";
import type { RulesEntry } from "@/hooks/useRulesList";

const TREE: RulesEntry[] = [
  { name: "CLAUDE.md", type: "file", path: "CLAUDE.md" },
  {
    name: "rules",
    type: "directory",
    path: "rules",
    children: [
      { name: "naming.md", type: "file", path: "rules/naming.md" },
      { name: "typescript.md", type: "file", path: "rules/typescript.md" },
    ],
  },
];

describe("FileTree", () => {
  it("renders the empty state when entries is []", () => {
    render(
      <FileTree
        entries={[]}
        selectedPath={null}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText(/No rules registered yet/)).toBeInTheDocument();
  });

  it("renders the emptyAction node when entries is empty", () => {
    render(
      <FileTree
        entries={[]}
        selectedPath={null}
        onSelect={() => undefined}
        emptyAction={<button type="button">create</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "create" })).toBeInTheDocument();
  });

  it("does not render the emptyAction when there are entries", () => {
    render(
      <FileTree
        entries={TREE}
        selectedPath={null}
        onSelect={() => undefined}
        emptyAction={<button type="button">should-not-show</button>}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "should-not-show" }),
    ).not.toBeInTheDocument();
  });

  it("renders directory headers and file buttons recursively", () => {
    render(
      <FileTree entries={TREE} selectedPath={null} onSelect={() => undefined} />,
    );
    expect(screen.getByText("rules/")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CLAUDE.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "naming.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "typescript.md" })).toBeInTheDocument();
  });

  it("calls onSelect with the file path when a file is clicked", () => {
    const onSelect = vi.fn();
    render(<FileTree entries={TREE} selectedPath={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "naming.md" }));
    expect(onSelect).toHaveBeenCalledWith("rules/naming.md");
  });

  it("highlights the active file with the accent background", () => {
    render(
      <FileTree
        entries={TREE}
        selectedPath="rules/typescript.md"
        onSelect={() => undefined}
      />,
    );
    const active = screen.getByRole("button", { name: "typescript.md" });
    const inactive = screen.getByRole("button", { name: "naming.md" });
    expect(active.className).toContain("bg-accent");
    expect(inactive.className).not.toContain("bg-accent");
  });

  it("indents nested files based on depth", () => {
    render(
      <FileTree entries={TREE} selectedPath={null} onSelect={() => undefined} />,
    );
    const rootFile = screen.getByRole("button", { name: "CLAUDE.md" });
    const nested = screen.getByRole("button", { name: "naming.md" });
    expect(rootFile.style.paddingLeft).toBe("8px");
    expect(nested.style.paddingLeft).toBe("24px");
  });
});
