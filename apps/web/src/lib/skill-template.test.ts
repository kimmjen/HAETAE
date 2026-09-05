import { describe, expect, it } from "vitest";
import {
  assembleFile,
  buildSkillPath,
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
describe("buildSkillPath", () => {
  it("joins directory + .md", () => {
    expect(buildSkillPath("skills", "commit-helper")).toBe("skills/commit-helper.md");
  });
});

