import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDataDir, getDbFilePath } from "./path";

const ENV_VAR = "HAETAE_DB_PATH";

describe("getDataDir", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV_VAR];
    delete process.env[ENV_VAR];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = original;
    }
  });

  it("returns an OS-standard data directory by default", () => {
    const dir = getDataDir();
    expect(path.isAbsolute(dir)).toBe(true);
    expect(dir.toLowerCase()).toContain("haetae");
  });

  it("honours HAETAE_DB_PATH override", () => {
    process.env[ENV_VAR] = "/tmp/haetae-test";
    expect(getDataDir()).toBe("/tmp/haetae-test");
  });

  it("resolves a relative override against the cwd", () => {
    process.env[ENV_VAR] = "./relative-path";
    const result = getDataDir();
    expect(path.isAbsolute(result)).toBe(true);
    expect(result.endsWith("relative-path")).toBe(true);
  });

  it("ignores an empty-string override", () => {
    process.env[ENV_VAR] = "";
    const result = getDataDir();
    expect(path.isAbsolute(result)).toBe(true);
    expect(result.toLowerCase()).toContain("haetae");
  });
});

describe("getDbFilePath", () => {
  it("appends cache.db to the data dir", () => {
    expect(getDbFilePath()).toBe(path.join(getDataDir(), "cache.db"));
  });
});
