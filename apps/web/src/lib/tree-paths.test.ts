import { describe, expect, it } from "vitest";
import { collectFilePaths } from "./tree-paths";

describe("collectFilePaths", () => {
  it("returns an empty set for an empty tree", () => {
    expect(collectFilePaths([])).toEqual(new Set());
  });

  it("collects top-level files", () => {
    const out = collectFilePaths([
      { name: "CLAUDE.md", type: "file", path: "CLAUDE.md" },
    ]);
    expect(out.has("CLAUDE.md")).toBe(true);
    expect(out.size).toBe(1);
  });

  it("walks into directories recursively", () => {
    const out = collectFilePaths([
      {
        name: "skills",
        type: "directory",
        path: "skills",
        children: [
          { name: "a.md", type: "file", path: "skills/a.md" },
          {
            name: "sub",
            type: "directory",
            path: "skills/sub",
            children: [
              { name: "b.md", type: "file", path: "skills/sub/b.md" },
            ],
          },
        ],
      },
    ]);
    expect([...out].sort()).toEqual(["skills/a.md", "skills/sub/b.md"]);
  });

  it("ignores directory entries themselves (only files end up in the set)", () => {
    const out = collectFilePaths([
      { name: "rules", type: "directory", path: "rules", children: [] },
    ]);
    expect(out.size).toBe(0);
  });
});
