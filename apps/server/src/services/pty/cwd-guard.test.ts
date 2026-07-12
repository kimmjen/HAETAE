import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { projectRoots } from "../../db/schema";
import {
  CwdInvalidError,
  CwdNotAllowedError,
  validateCwd,
} from "./cwd-guard";

const HOME_ENV = "HAETAE_CLAUDE_HOME";
const ROOTS_ENV = "HAETAE_PROJECT_ROOTS";

describe("validateCwd", () => {
  let originalHome: string | undefined;
  let originalRoots: string | undefined;
  let claudeHome: string;
  let envProject: string;
  let userProject: string;
  let db: Db;

  beforeEach(() => {
    originalHome = process.env[HOME_ENV];
    originalRoots = process.env[ROOTS_ENV];
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-cwd-claude-"));
    envProject = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-cwd-env-"));
    userProject = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-cwd-user-"));
    process.env[HOME_ENV] = claudeHome;
    process.env[ROOTS_ENV] = envProject;
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    db.insert(projectRoots).values({ absolutePath: userProject }).run();
  });

  afterEach(() => {
    closeDb();
    if (originalHome === undefined) delete process.env[HOME_ENV];
    else process.env[HOME_ENV] = originalHome;
    if (originalRoots === undefined) delete process.env[ROOTS_ENV];
    else process.env[ROOTS_ENV] = originalRoots;
    fs.rmSync(claudeHome, { recursive: true, force: true });
    fs.rmSync(envProject, { recursive: true, force: true });
    fs.rmSync(userProject, { recursive: true, force: true });
  });

  it("defaults to the claude home when cwd is undefined / empty", async () => {
    expect(await validateCwd(undefined, { db })).toBe(path.resolve(claudeHome));
    expect(await validateCwd("", { db })).toBe(path.resolve(claudeHome));
  });

  it("accepts the claude home itself", async () => {
    expect(await validateCwd(claudeHome, { db })).toBe(path.resolve(claudeHome));
  });

  it("accepts a subdirectory of the claude home", async () => {
    const sub = path.join(claudeHome, "sub");
    fs.mkdirSync(sub);
    expect(await validateCwd(sub, { db })).toBe(path.resolve(sub));
  });

  it("accepts an env project root", async () => {
    expect(await validateCwd(envProject, { db })).toBe(path.resolve(envProject));
  });

  it("accepts the app's own checkout without registration (NotebookLM re-auth cwd)", async () => {
    // env/DB roots point at temp dirs here, so this only passes via ownRepoRoot.
    const notebooklmDir = path.resolve(import.meta.dirname, "../../../../..", "apps/notebooklm");
    expect(await validateCwd(notebooklmDir, { db })).toBe(notebooklmDir);
  });

  it("accepts a DB project root and a subdirectory of it", async () => {
    expect(await validateCwd(userProject, { db })).toBe(path.resolve(userProject));
    const sub = path.join(userProject, "src");
    fs.mkdirSync(sub);
    expect(await validateCwd(sub, { db })).toBe(path.resolve(sub));
  });

  it("rejects a directory outside every allowed root", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-cwd-outside-"));
    try {
      await expect(validateCwd(outside, { db })).rejects.toBeInstanceOf(CwdNotAllowedError);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a relative path", async () => {
    await expect(validateCwd("./relative", { db })).rejects.toBeInstanceOf(
      CwdInvalidError,
    );
  });

  it("rejects a non-existent path", async () => {
    await expect(
      validateCwd(path.join(claudeHome, "ghost-dir"), { db }),
    ).rejects.toBeInstanceOf(CwdInvalidError);
  });

  it("rejects a regular file (not a directory)", async () => {
    const file = path.join(claudeHome, "file.txt");
    fs.writeFileSync(file, "x");
    await expect(validateCwd(file, { db })).rejects.toBeInstanceOf(CwdInvalidError);
  });

  it("rejects a `..` escape that lands outside the roots", async () => {
    const escape = path.join(envProject, "..");
    await expect(validateCwd(escape, { db })).rejects.toBeInstanceOf(
      CwdNotAllowedError,
    );
  });

  it("expands a leading ~ to the user's home directory", async () => {
    // Use whatever home holds the claudeHome temp dir to keep it allowed —
    // we register HAETAE_CLAUDE_HOME explicitly above, so any cwd inside
    // it (referenced via ~) should resolve and pass.
    const originalHomeEnv = process.env.HOME;
    process.env.HOME = claudeHome;
    try {
      // Pure tilde maps to home itself.
      expect(await validateCwd("~", { db })).toBe(path.resolve(claudeHome));
      // ~/sub maps to home/sub.
      const sub = path.join(claudeHome, "nested");
      fs.mkdirSync(sub);
      expect(await validateCwd("~/nested", { db })).toBe(path.resolve(sub));
    } finally {
      if (originalHomeEnv === undefined) delete process.env.HOME;
      else process.env.HOME = originalHomeEnv;
    }
  });
});
