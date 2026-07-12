import { describe, expect, it } from "vitest";
import { extractJson, isClaudeModel, coerceModel, DEFAULT_MODEL } from "./claude-cli";

describe("model SSOT", () => {
  it("isClaudeModel accepts valid models, rejects others", () => {
    expect(isClaudeModel("claude-opus-4-8")).toBe(true);
    expect(isClaudeModel("claude-sonnet-4-6")).toBe(true);
    expect(isClaudeModel("gpt-4")).toBe(false);
    expect(isClaudeModel(undefined)).toBe(false);
  });
  it("coerceModel passes valid through, falls back to default", () => {
    expect(coerceModel("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5-20251001");
    expect(coerceModel("bogus")).toBe(DEFAULT_MODEL);
    expect(coerceModel(undefined)).toBe(DEFAULT_MODEL);
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
