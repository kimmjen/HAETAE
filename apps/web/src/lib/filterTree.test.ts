import { describe, expect, it } from "vitest";
import { filterRulesTree } from "./filterTree";
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
      {
        name: "sub",
        type: "directory",
        path: "rules/sub",
        children: [{ name: "inner.md", type: "file", path: "rules/sub/inner.md" }],
      },
    ],
  },
  {
    name: "skills",
    type: "directory",
    path: "skills",
    children: [{ name: "commit-helper.md", type: "file", path: "skills/commit-helper.md" }],
  },
];

describe("filterRulesTree", () => {
  it("returns the input unchanged for an empty query", () => {
    expect(filterRulesTree(TREE, "")).toBe(TREE);
    expect(filterRulesTree(TREE, "   ")).toBe(TREE);
  });

  it("matches by file name (case-insensitive)", () => {
    const result = filterRulesTree(TREE, "TYPESCRIPT");
    expect(result).toEqual([
      {
        name: "rules",
        type: "directory",
        path: "rules",
        children: [
          { name: "typescript.md", type: "file", path: "rules/typescript.md" },
        ],
      },
    ]);
  });

  it("matches by path", () => {
    const result = filterRulesTree(TREE, "rules/sub");
    expect(result).toEqual([
      {
        name: "rules",
        type: "directory",
        path: "rules",
        children: [
          {
            name: "sub",
            type: "directory",
            path: "rules/sub",
            children: [{ name: "inner.md", type: "file", path: "rules/sub/inner.md" }],
          },
        ],
      },
    ]);
  });

  it("keeps a directory whose own name matches", () => {
    const result = filterRulesTree(TREE, "skills");
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("skills");
    expect(result[0]?.children).toHaveLength(1);
  });

  it("drops directories with no matching descendants", () => {
    const result = filterRulesTree(TREE, "nothing-here");
    expect(result).toEqual([]);
  });

  it("preserves the root file when it matches", () => {
    const result = filterRulesTree(TREE, "CLAUDE");
    expect(result).toEqual([
      { name: "CLAUDE.md", type: "file", path: "CLAUDE.md" },
    ]);
  });

  it("returns multiple roots when multiple branches match", () => {
    const result = filterRulesTree(TREE, ".md");
    // every file ends with .md, so every directory survives
    expect(result.map((e) => e.name)).toEqual(["CLAUDE.md", "rules", "skills"]);
  });
});
