import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { projectRoots } from "../../db/schema";
import {
  canonicalizeProjectPath,
  discoverProjects,
  getProjectRoots,
  getUserRoots,
  isKnownProjectPath,
} from "./discover";

const ENV = "HAETAE_PROJECT_ROOTS";
const CLAUDE_HOME_ENV = "HAETAE_CLAUDE_HOME";

describe("getProjectRoots", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV];
    delete process.env[ENV];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV];
    else process.env[ENV] = original;
  });

  it("returns [] when env is unset", () => {
    expect(getProjectRoots()).toEqual([]);
  });

  it("returns [] when env is empty / whitespace only", () => {
    process.env[ENV] = "   ";
    expect(getProjectRoots()).toEqual([]);
  });

  it("parses a single absolute path", () => {
    process.env[ENV] = "/tmp/one";
    expect(getProjectRoots()).toEqual(["/tmp/one"]);
  });

  it("splits by colon and trims whitespace", () => {
    process.env[ENV] = "/tmp/a : /tmp/b: /tmp/c";
    expect(getProjectRoots()).toEqual(["/tmp/a", "/tmp/b", "/tmp/c"]);
  });

  it("dedupes equal paths", () => {
    process.env[ENV] = "/tmp/x:/tmp/x:/tmp/y";
    expect(getProjectRoots()).toEqual(["/tmp/x", "/tmp/y"]);
  });

  it("resolves relative paths against cwd", () => {
    process.env[ENV] = "./relative-x";
    const result = getProjectRoots();
    expect(result).toHaveLength(1);
    expect(path.isAbsolute(result[0]!)).toBe(true);
    expect(result[0]!.endsWith("relative-x")).toBe(true);
  });
});

describe("discoverProjects", () => {
  let original: string | undefined;
  let originalClaudeHome: string | undefined;
  let tmpDir: string;
  let claudeHome: string;
  let db: Db;

  beforeEach(() => {
    original = process.env[ENV];
    originalClaudeHome = process.env[CLAUDE_HOME_ENV];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-projects-"));
    // Isolated Claude Code home so hasSession lookups don't reach into the
    // real ~/.claude/projects/ on the dev machine running tests.
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-claude-home-"));
    process.env[CLAUDE_HOME_ENV] = claudeHome;
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
    if (original === undefined) delete process.env[ENV];
    else process.env[ENV] = original;
    if (originalClaudeHome === undefined) delete process.env[CLAUDE_HOME_ENV];
    else process.env[CLAUDE_HOME_ENV] = originalClaudeHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  it("returns [] when no roots configured (env or DB)", async () => {
    delete process.env[ENV];
    expect(await discoverProjects(db)).toEqual([]);
  });

  it("flags hasClaudeDir based on .claude/ presence", async () => {
    const a = path.join(tmpDir, "Alpha");
    const b = path.join(tmpDir, "Empty");
    fs.mkdirSync(path.join(a, ".claude"), { recursive: true });
    fs.mkdirSync(b);
    process.env[ENV] = `${a}:${b}`;

    const result = await discoverProjects(db);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "Alpha", hasClaudeDir: true, source: "env" });
    expect(result[1]).toMatchObject({ name: "Empty", hasClaudeDir: false, source: "env" });
  });

  it("slugifies the basename (lowercase, dashes)", async () => {
    const dir = path.join(tmpDir, "Beta Sim");
    fs.mkdirSync(dir);
    process.env[ENV] = dir;
    const [project] = await discoverProjects(db);
    expect(project?.slug).toBe("beta-sim");
  });

  it("disambiguates clashing slugs by suffix", async () => {
    const a = path.join(tmpDir, "outer-a", "Docs");
    const b = path.join(tmpDir, "outer-b", "Docs");
    fs.mkdirSync(a, { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    process.env[ENV] = `${a}:${b}`;
    const result = await discoverProjects(db);
    expect(result.map((p) => p.slug)).toEqual(["docs", "docs-1"]);
  });

  it("treats non-existent root as hasClaudeDir=false (does not throw)", async () => {
    process.env[ENV] = "/tmp/__definitely-not-here-haetae__";
    const result = await discoverProjects(db);
    expect(result).toHaveLength(1);
    expect(result[0]?.hasClaudeDir).toBe(false);
  });

  it("merges env + DB roots, env first, with correct source labels", async () => {
    const envDir = path.join(tmpDir, "EnvProj");
    const userDir = path.join(tmpDir, "UserProj");
    fs.mkdirSync(envDir);
    fs.mkdirSync(userDir);
    process.env[ENV] = envDir;
    db.insert(projectRoots).values({ absolutePath: userDir }).run();

    const result = await discoverProjects(db);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "EnvProj", source: "env" });
    expect(result[0]?.id).toBeUndefined();
    expect(result[1]).toMatchObject({ name: "UserProj", source: "user" });
    expect(result[1]?.id).toBeGreaterThan(0);
  });

  it("when env and DB both list the same path, env wins (no duplicate row)", async () => {
    const dir = path.join(tmpDir, "Dup");
    fs.mkdirSync(dir);
    process.env[ENV] = dir;
    db.insert(projectRoots).values({ absolutePath: dir }).run();

    const result = await discoverProjects(db);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("env");
  });

  it("flags hasSession=true when ~/.claude/projects/<encoded>/*.jsonl exists", async () => {
    // Two roots: one with a recorded Claude Code session, one without.
    const withSess = path.join(tmpDir, "Has");
    const noSess = path.join(tmpDir, "Empty");
    fs.mkdirSync(withSess);
    fs.mkdirSync(noSess);

    // Encoding mirrors Claude Code: every / becomes -.
    const encoded = withSess.replace(/\//g, "-");
    const sessionDir = path.join(claudeHome, "projects", encoded);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "abc-123.jsonl"), "{}\n");

    process.env[ENV] = `${withSess}:${noSess}`;
    const result = await discoverProjects(db);
    expect(result).toHaveLength(2);
    expect(result.find((p) => p.name === "Has")?.hasSession).toBe(true);
    expect(result.find((p) => p.name === "Empty")?.hasSession).toBe(false);
  });

  it("hasSession=false when the project dir exists but only non-jsonl files", async () => {
    const root = path.join(tmpDir, "OnlyMeta");
    fs.mkdirSync(root);
    const encoded = root.replace(/\//g, "-");
    const sessionDir = path.join(claudeHome, "projects", encoded);
    fs.mkdirSync(sessionDir, { recursive: true });
    // settings.local.json + memory/ — Claude Code's own metadata, not a session log
    fs.writeFileSync(path.join(sessionDir, "settings.local.json"), "{}");
    fs.mkdirSync(path.join(sessionDir, "memory"));

    process.env[ENV] = root;
    const [project] = await discoverProjects(db);
    expect(project?.hasSession).toBe(false);
  });
});

describe("getUserRoots", () => {
  let db: Db;

  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
  });

  it("returns DB rows ordered by added_at then id", () => {
    db.insert(projectRoots).values({ absolutePath: "/x/a" }).run();
    db.insert(projectRoots).values({ absolutePath: "/x/b" }).run();
    const out = getUserRoots(db);
    expect(out.map((r) => r.absolutePath)).toEqual(["/x/a", "/x/b"]);
  });
});

describe("isKnownProjectPath", () => {
  const known = ["/Users/me/GitHub/Beta", "/Users/me/GitHub/Alpha"];

  it("accepts an exact registered root", () => {
    expect(isKnownProjectPath(known, "/Users/me/GitHub/Beta")).toBe(true);
  });

  it("accepts trailing-slash / non-normalized variants of a known root", () => {
    expect(isKnownProjectPath(known, "/Users/me/GitHub/Beta/")).toBe(true);
    expect(isKnownProjectPath(known, "/Users/me/GitHub/foo/../Beta")).toBe(true);
  });

  it("rejects unknown paths and traversal escapes", () => {
    expect(isKnownProjectPath(known, "/etc")).toBe(false);
    expect(isKnownProjectPath(known, "/Users/me/GitHub/Beta/../../../etc")).toBe(false);
    expect(isKnownProjectPath(known, "/Users/me/GitHub/Beta/../evil")).toBe(false);
  });

  it("rejects a sub-directory of a known root (must be the root itself)", () => {
    expect(isKnownProjectPath(known, "/Users/me/GitHub/Beta/src")).toBe(false);
  });
});

describe("canonicalizeProjectPath", () => {
  it("leaves an already-correctly-cased existing path unchanged (no symlink resolution)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-canon-"));
    try {
      // Must NOT resolve symlinks (e.g. macOS /var → /private/var), so it equals
      // the plain resolved path rather than realpath.
      expect(canonicalizeProjectPath(dir)).toBe(path.resolve(dir));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the resolved path when it doesn't exist (no throw)", () => {
    const missing = path.join(os.tmpdir(), "haetae-canon-missing-zzz");
    expect(canonicalizeProjectPath(missing)).toBe(path.resolve(missing));
  });

  it("repairs a wrong-cased segment to the real on-disk casing (the bug: Github→GitHub)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-canon-"));
    try {
      fs.mkdirSync(path.join(root, "MixedCase"));
      // No exact "mixedcase" entry exists, so the case-insensitive match returns
      // the real "MixedCase" — on both case-insensitive (macOS) and case-sensitive
      // (Linux CI) filesystems, since we match against readdir entries directly.
      expect(canonicalizeProjectPath(path.join(root, "mixedcase"))).toBe(path.join(root, "MixedCase"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("prefers an exact-case entry when one exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-canon-"));
    try {
      fs.mkdirSync(path.join(root, "Exact"));
      expect(canonicalizeProjectPath(path.join(root, "Exact"))).toBe(path.join(root, "Exact"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
