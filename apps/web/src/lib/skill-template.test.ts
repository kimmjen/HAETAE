import { describe, expect, it } from "vitest";
import {
  assembleFile,
  buildSkillPath,
  isValidSkillName,
  sanitizeSkillName,
} from "./skill-template";

describe("assembleFile", () => {
  it("emits a minimal frontmatter block + body", () => {
    const result = assembleFile({
      name: "commit-helper",
      description: "Help write commits",
      options: { disableModelInvocation: false, userInvocable: false },
      body: "# Body\n",
    });
    expect(result).toBe(
      [
        "---",
        `name: "commit-helper"`,
        `description: "Help write commits"`,
        "---",
        "",
        "# Body",
        "",
      ].join("\n"),
    );
  });

  it("only emits flags that are truthy", () => {
    const result = assembleFile({
      name: "x",
      description: "y",
      options: { disableModelInvocation: true, userInvocable: false },
      body: "z",
    });
    expect(result).toContain("disable-model-invocation: true");
    expect(result).not.toContain("user-invocable");
  });

  it("emits both flags when both are true", () => {
    const result = assembleFile({
      name: "x",
      description: "y",
      options: { disableModelInvocation: true, userInvocable: true },
      body: "z",
    });
    expect(result).toContain("disable-model-invocation: true");
    expect(result).toContain("user-invocable: true");
  });

  it("JSON-encodes strings with colons / quotes / unicode safely", () => {
    const result = assembleFile({
      name: "a",
      description: 'has "quotes" and: colon — 한글',
      options: { disableModelInvocation: false, userInvocable: false },
      body: "ok",
    });
    // The description line is JSON-stringified so it round-trips through any
    // YAML parser without surprises.
    expect(result).toContain(
      `description: "has \\"quotes\\" and: colon — 한글"`,
    );
  });

  it("trims and skips a blank body", () => {
    const result = assembleFile({
      name: "x",
      description: "y",
      options: { disableModelInvocation: false, userInvocable: false },
      body: "   \n\n",
    });
    expect(result.endsWith("---\n")).toBe(true);
    expect(result).not.toMatch(/\n\s*\n\s*\n/);
  });
});

describe("sanitizeSkillName", () => {
  it("lowers, replaces spaces, strips edges", () => {
    expect(sanitizeSkillName("  My Cool Skill  ")).toBe("my-cool-skill");
  });

  it("strips trailing .md", () => {
    expect(sanitizeSkillName("commit-helper.md")).toBe("commit-helper");
  });

  it("collapses non-allowed runs to a single dash", () => {
    expect(sanitizeSkillName("a@@@b___c")).toBe("a-b___c");
  });
});

describe("isValidSkillName", () => {
  it("accepts the canonical pattern", () => {
    expect(isValidSkillName("commit-helper")).toBe(true);
    expect(isValidSkillName("a_b_c")).toBe(true);
    expect(isValidSkillName("v1")).toBe(true);
  });

  it("rejects empty / uppercase / spaces / dots", () => {
    expect(isValidSkillName("")).toBe(false);
    expect(isValidSkillName("Foo")).toBe(false);
    expect(isValidSkillName("foo bar")).toBe(false);
    expect(isValidSkillName("foo.md")).toBe(false);
  });
});

describe("buildSkillPath", () => {
  it("joins directory + .md", () => {
    expect(buildSkillPath("skills", "commit-helper")).toBe("skills/commit-helper.md");
  });
});
