import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchTree } from "./search";

describe("searchTree", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-search-"));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("returns [] for an empty query", async () => {
    fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "anything");
    expect(await searchTree(tmpHome, "")).toEqual([]);
    expect(await searchTree(tmpHome, "   ")).toEqual([]);
  });

  it("matches body content with line numbers (1-based)", async () => {
    fs.writeFileSync(
      path.join(tmpHome, "CLAUDE.md"),
      "line one\nline two has needle\nline three",
    );
    const results = await searchTree(tmpHome, "needle");
    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe("CLAUDE.md");
    expect(results[0]?.matches).toEqual([{ line: 2, text: "line two has needle" }]);
  });

  it("matches frontmatter (we grep raw file)", async () => {
    fs.mkdirSync(path.join(tmpHome, "rules"));
    fs.writeFileSync(
      path.join(tmpHome, "rules/x.md"),
      "---\ntags: [bloomberg]\n---\nbody",
    );
    const results = await searchTree(tmpHome, "bloomberg");
    expect(results[0]?.matches[0]?.text).toContain("bloomberg");
  });

  it("is case-insensitive", async () => {
    fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "TypeScript here");
    const results = await searchTree(tmpHome, "typescript");
    expect(results).toHaveLength(1);
  });

  it("returns multiple files in tree order", async () => {
    fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "shared word");
    fs.mkdirSync(path.join(tmpHome, "rules"));
    fs.writeFileSync(path.join(tmpHome, "rules/a.md"), "shared again");
    const results = await searchTree(tmpHome, "shared");
    expect(results.map((r) => r.path)).toEqual(["CLAUDE.md", "rules/a.md"]);
  });

  it("caps matches per file at 5", async () => {
    fs.writeFileSync(
      path.join(tmpHome, "CLAUDE.md"),
      Array.from({ length: 10 }, (_, i) => `line ${i} word`).join("\n"),
    );
    const results = await searchTree(tmpHome, "word");
    expect(results[0]?.matches).toHaveLength(5);
  });

  it("returns [] when home is missing", async () => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    expect(await searchTree(tmpHome, "anything")).toEqual([]);
  });

  it("truncates very long matching lines around the match", async () => {
    const filler = "a".repeat(300);
    fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), `${filler}NEEDLE${filler}`);
    const results = await searchTree(tmpHome, "NEEDLE");
    const text = results[0]?.matches[0]?.text ?? "";
    expect(text.length).toBeLessThanOrEqual(220);
    expect(text).toContain("NEEDLE");
    expect(text.startsWith("…")).toBe(true);
    expect(text.endsWith("…")).toBe(true);
  });
});
