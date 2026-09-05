import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractJson, isClaudeModel, coerceModel, DEFAULT_MODEL, CLAUDE_MODELS } from "./claude-cli";

describe("model SSOT", () => {
  it("isClaudeModel accepts the CLI aliases, rejects others", () => {
    expect(isClaudeModel("opus")).toBe(true);
    expect(isClaudeModel("sonnet")).toBe(true);
    expect(isClaudeModel("haiku")).toBe(true);
    expect(isClaudeModel("gpt-4")).toBe(false);
    expect(isClaudeModel(undefined)).toBe(false);
  });
  it("rejects pinned ids so a rotted stored value falls back to the alias", () => {
    // Rows written before the alias switch carry pinned ids; they must coerce
    // to the default rather than being passed through to a retired model.
    expect(coerceModel("claude-opus-4-7")).toBe(DEFAULT_MODEL);
    expect(coerceModel("claude-sonnet-4-6")).toBe(DEFAULT_MODEL);
  });
  it("coerceModel passes valid through, falls back to default", () => {
    expect(coerceModel("haiku")).toBe("haiku");
    expect(coerceModel("bogus")).toBe(DEFAULT_MODEL);
    expect(coerceModel(undefined)).toBe(DEFAULT_MODEL);
  });
  it("default is the first entry, so the dropdown order carries it", () => {
    expect(DEFAULT_MODEL).toBe(CLAUDE_MODELS[0]);
  });

  // The web bundle cannot import this file (it pulls in node:child_process), so
  // apps/web/src/lib/models.ts hand-mirrors the list. That mirror has silently
  // drifted before — auto-wiki.ts kept a third copy that was missing a model
  // for an entire generation. Read the mirror as text and fail on divergence.
  it("apps/web mirror lists exactly these models, in order", () => {
    const mirror = fileURLToPath(new URL("../../../../web/src/lib/models.ts", import.meta.url));
    const values = [...readFileSync(mirror, "utf8").matchAll(/value:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(values).toEqual([...CLAUDE_MODELS]);
  });
});

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips ```json fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("recovers JSON wrapped in prose", () => {
    expect(extractJson('Here you go:\n{"a":1, "b":[2,3]}\nHope that helps!')).toEqual({ a: 1, b: [2, 3] });
  });
  it("throws when there is no JSON object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});
