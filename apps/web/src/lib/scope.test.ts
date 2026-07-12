import { describe, expect, it } from "vitest";
import { appendScope, scopeKey } from "./scope";

describe("appendScope", () => {
  it("returns the URL untouched for global / undefined / empty", () => {
    expect(appendScope("/api/x", undefined)).toBe("/api/x");
    expect(appendScope("/api/x", "global")).toBe("/api/x");
    expect(appendScope("/api/x", "")).toBe("/api/x");
  });

  it("appends ?scope=<slug> when no other query exists", () => {
    expect(appendScope("/api/x", "agm")).toBe("/api/x?scope=agm");
  });

  it("appends &scope=<slug> when a query already exists", () => {
    expect(appendScope("/api/x?path=foo", "agm")).toBe(
      "/api/x?path=foo&scope=agm",
    );
  });

  it("URL-encodes the slug", () => {
    expect(appendScope("/api/x", "a b")).toBe("/api/x?scope=a%20b");
  });
});

describe("scopeKey", () => {
  it("normalizes undefined / empty / 'global' to 'global'", () => {
    expect(scopeKey(undefined)).toBe("global");
    expect(scopeKey("")).toBe("global");
    expect(scopeKey("global")).toBe("global");
  });

  it("returns the slug unchanged otherwise", () => {
    expect(scopeKey("agm")).toBe("agm");
  });
});
