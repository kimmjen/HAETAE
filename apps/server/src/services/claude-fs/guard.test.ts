import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSafePath, PathOutsideClaudeHomeError } from "./guard";

describe("assertSafePath", () => {
  const home = "/tmp/haetae-guard-home";

  it("accepts a relative path inside the home", () => {
    expect(assertSafePath(home, "rules/typescript.md")).toBe(
      path.join(home, "rules/typescript.md"),
    );
  });

  it("accepts an absolute path inside the home", () => {
    const target = path.join(home, "skills/commit-helper.md");
    expect(assertSafePath(home, target)).toBe(target);
  });

  it("rejects a relative path that escapes via ..", () => {
    expect(() => assertSafePath(home, "../etc/passwd")).toThrow(
      PathOutsideClaudeHomeError,
    );
  });

  it("rejects an absolute path outside the home", () => {
    expect(() => assertSafePath(home, "/etc/passwd")).toThrow(
      PathOutsideClaudeHomeError,
    );
  });

  it("rejects a tricky relative path that resolves outside", () => {
    expect(() => assertSafePath(home, "rules/../../escape")).toThrow(
      PathOutsideClaudeHomeError,
    );
  });

  it("accepts the home root itself", () => {
    expect(assertSafePath(home, "")).toBe(path.resolve(home));
    expect(assertSafePath(home, ".")).toBe(path.resolve(home));
  });

  it("isolates two different homes from each other", () => {
    const projectHome = "/tmp/haetae-guard-project/.claude";
    expect(() => assertSafePath(home, projectHome)).toThrow(
      PathOutsideClaudeHomeError,
    );
    expect(assertSafePath(projectHome, "skills/x.md")).toBe(
      path.join(projectHome, "skills/x.md"),
    );
  });
});
