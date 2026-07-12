import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations } from "../../db";
import { resolveScope, UnknownScopeError } from "./scope";

const HOME_ENV = "HAETAE_CLAUDE_HOME";
const ROOTS_ENV = "HAETAE_PROJECT_ROOTS";

describe("resolveScope", () => {
  let originalHome: string | undefined;
  let originalRoots: string | undefined;
  let tmp: string;

  beforeEach(() => {
    originalHome = process.env[HOME_ENV];
    originalRoots = process.env[ROOTS_ENV];
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-scope-"));
    runMigrations(openDb({ filePath: ":memory:" }));
  });

  afterEach(() => {
    closeDb();
    if (originalHome === undefined) delete process.env[HOME_ENV];
    else process.env[HOME_ENV] = originalHome;
    if (originalRoots === undefined) delete process.env[ROOTS_ENV];
    else process.env[ROOTS_ENV] = originalRoots;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("resolves undefined / empty / 'global' to the global scope", async () => {
    process.env[HOME_ENV] = tmp;
    process.env[ROOTS_ENV] = "";

    for (const slug of [undefined, "", "global"]) {
      const s = await resolveScope(slug);
      expect(s.kind).toBe("global");
      expect(s.key).toBe("global");
      expect(s.claudeHome).toBe(path.resolve(tmp));
    }
  });

  it("resolves a project slug to that project's .claude directory", async () => {
    const projectRoot = path.join(tmp, "Alpha");
    fs.mkdirSync(path.join(projectRoot, ".claude"), { recursive: true });
    process.env[ROOTS_ENV] = projectRoot;

    const s = await resolveScope("alpha");
    expect(s.kind).toBe("project");
    expect(s.slug).toBe("alpha");
    expect(s.projectName).toBe("Alpha");
    expect(s.key).toBe("project:alpha");
    expect(s.claudeHome).toBe(path.join(projectRoot, ".claude"));
  });

  it("still resolves a project even if its .claude does not exist yet", async () => {
    const projectRoot = path.join(tmp, "Empty");
    fs.mkdirSync(projectRoot, { recursive: true });
    process.env[ROOTS_ENV] = projectRoot;

    const s = await resolveScope("empty");
    expect(s.claudeHome).toBe(path.join(projectRoot, ".claude"));
  });

  it("throws UnknownScopeError for an unknown slug", async () => {
    process.env[ROOTS_ENV] = "";
    await expect(resolveScope("does-not-exist")).rejects.toBeInstanceOf(
      UnknownScopeError,
    );
  });
});
