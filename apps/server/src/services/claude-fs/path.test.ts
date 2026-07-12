import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getClaudeHome } from "./path";

const ENV = "HAETAE_CLAUDE_HOME";

describe("getClaudeHome", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV];
    delete process.env[ENV];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV];
    else process.env[ENV] = original;
  });

  it("defaults to ~/.claude when no env override", () => {
    expect(getClaudeHome()).toBe(path.join(os.homedir(), ".claude"));
  });

  it("honours HAETAE_CLAUDE_HOME absolute path", () => {
    process.env[ENV] = "/tmp/fake-claude";
    expect(getClaudeHome()).toBe("/tmp/fake-claude");
  });

  it("resolves a relative override against cwd", () => {
    process.env[ENV] = "./some-rel";
    expect(path.isAbsolute(getClaudeHome())).toBe(true);
    expect(getClaudeHome().endsWith("some-rel")).toBe(true);
  });

  it("ignores empty-string override", () => {
    process.env[ENV] = "";
    expect(getClaudeHome()).toBe(path.join(os.homedir(), ".claude"));
  });
});
