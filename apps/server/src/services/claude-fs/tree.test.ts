import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTree } from "./tree";

describe("readTree", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-claude-"));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns an empty array when the home directory does not exist", async () => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    expect(await readTree(tmpHome)).toEqual([]);
  });

  it("includes CLAUDE.md at the root when present", async () => {
    fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "# root rules\n");
    const tree = await readTree(tmpHome);
    expect(tree[0]).toEqual({ name: "CLAUDE.md", type: "file", path: "CLAUDE.md" });
  });

  it("walks rules/ recursively and returns sorted children", async () => {
    fs.mkdirSync(path.join(tmpHome, "rules"));
    fs.writeFileSync(path.join(tmpHome, "rules/typescript.md"), "");
    fs.writeFileSync(path.join(tmpHome, "rules/naming.md"), "");
    fs.mkdirSync(path.join(tmpHome, "rules/sub"));
    fs.writeFileSync(path.join(tmpHome, "rules/sub/inner.md"), "");

    const tree = await readTree(tmpHome);
    const rules = tree.find((e) => e.name === "rules");
    expect(rules?.type).toBe("directory");
    expect(rules?.children?.map((c) => c.name)).toEqual([
      "sub",
      "naming.md",
      "typescript.md",
    ]);

    const sub = rules?.children?.find((c) => c.name === "sub");
    expect(sub?.children?.[0]?.path).toBe("rules/sub/inner.md");
  });

  it("ignores hidden files and non-markdown files", async () => {
    fs.mkdirSync(path.join(tmpHome, "skills"));
    fs.writeFileSync(path.join(tmpHome, "skills/.DS_Store"), "");
    fs.writeFileSync(path.join(tmpHome, "skills/notes.txt"), "");
    fs.writeFileSync(path.join(tmpHome, "skills/commit-helper.md"), "");

    const tree = await readTree(tmpHome);
    const skills = tree.find((e) => e.name === "skills");
    expect(skills?.children?.map((c) => c.name)).toEqual(["commit-helper.md"]);
  });

  it("only surfaces the four config directories (skips projects, statsig, etc.)", async () => {
    fs.mkdirSync(path.join(tmpHome, "rules"));
    fs.mkdirSync(path.join(tmpHome, "skills"));
    fs.mkdirSync(path.join(tmpHome, "projects"));
    fs.mkdirSync(path.join(tmpHome, "statsig"));
    fs.mkdirSync(path.join(tmpHome, "todos"));

    const names = (await readTree(tmpHome)).map((e) => e.name);
    expect(names).toContain("rules");
    expect(names).toContain("skills");
    expect(names).not.toContain("projects");
    expect(names).not.toContain("statsig");
    expect(names).not.toContain("todos");
  });

  describe('category filter', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "");
      fs.mkdirSync(path.join(tmpHome, "rules"));
      fs.writeFileSync(path.join(tmpHome, "rules/r.md"), "");
      fs.mkdirSync(path.join(tmpHome, "skills"));
      fs.writeFileSync(path.join(tmpHome, "skills/s.md"), "");
      fs.mkdirSync(path.join(tmpHome, "agents"));
      fs.writeFileSync(path.join(tmpHome, "agents/a.md"), "");
      fs.mkdirSync(path.join(tmpHome, "commands"));
      fs.writeFileSync(path.join(tmpHome, "commands/c.md"), "");
    });

    it("category='rules' returns CLAUDE.md + rules/ only", async () => {
      const tree = await readTree(tmpHome, { category: "rules" });
      const names = tree.map((e) => e.name);
      expect(names).toContain("CLAUDE.md");
      expect(names).toContain("rules");
      expect(names).not.toContain("skills");
      expect(names).not.toContain("agents");
      expect(names).not.toContain("commands");
    });

    it("category='skills' returns skills/ only (no CLAUDE.md, no rules)", async () => {
      const tree = await readTree(tmpHome, { category: "skills" });
      const names = tree.map((e) => e.name);
      expect(names).toEqual(["skills"]);
      expect(tree[0]?.children?.[0]?.name).toBe("s.md");
    });

    it("undefined category returns the full tree (current behavior)", async () => {
      const tree = await readTree(tmpHome);
      const names = tree.map((e) => e.name);
      expect(names).toContain("CLAUDE.md");
      expect(names).toContain("rules");
      expect(names).toContain("skills");
      expect(names).toContain("agents");
      expect(names).toContain("commands");
    });

    it("category='skills' on a home that has no skills/ returns []", async () => {
      const empty = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-claude-empty-"));
      try {
        expect(await readTree(empty, { category: "skills" })).toEqual([]);
      } finally {
        fs.rmSync(empty, { recursive: true, force: true });
      }
    });
  });
});
