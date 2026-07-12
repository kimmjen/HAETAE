import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import {
  FileAlreadyExistsError,
  FileNotFoundError,
  InvalidFileExtensionError,
  StaleMtimeError,
  createFile,
  readFile,
  writeFile,
} from "./file";
import { listBackups } from "./backup";

const SCOPE = "global";

describe("readFile / writeFile", () => {
  let tmpHome: string;
  let db: Db;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-fs-"));
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("reads markdown without frontmatter", async () => {
    fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "hello\n");
    const r = await readFile(tmpHome, "CLAUDE.md");
    expect(r.content).toBe("hello\n");
    expect(r.frontmatter).toEqual({});
    expect(typeof r.mtime).toBe("number");
  });

  it("parses frontmatter on read", async () => {
    fs.mkdirSync(path.join(tmpHome, "skills"));
    fs.writeFileSync(
      path.join(tmpHome, "skills/x.md"),
      "---\nname: x\ndisable: true\n---\nbody\n",
    );
    const r = await readFile(tmpHome, "skills/x.md");
    expect(r.frontmatter).toEqual({ name: "x", disable: true });
    expect(r.content.trim()).toBe("body");
  });

  it("throws FileNotFoundError when the file is missing", async () => {
    await expect(readFile(tmpHome, "rules/missing.md")).rejects.toBeInstanceOf(
      FileNotFoundError,
    );
  });

  it("write succeeds and returns fresh mtime + frontmatter", async () => {
    const file = path.join(tmpHome, "rules/a.md");
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, "v1\n");
    const before = await readFile(tmpHome, "rules/a.md");

    const after = await writeFile(
      db,
      tmpHome,
      SCOPE,
      "rules/a.md",
      "---\nname: a\n---\nv2\n",
      before.mtime,
    );

    expect(fs.readFileSync(file, "utf8")).toBe("---\nname: a\n---\nv2\n");
    expect(after.frontmatter).toEqual({ name: "a" });
    expect(after.content.trim()).toBe("v2");
    expect(after.mtime).toBeGreaterThanOrEqual(before.mtime);
    expect(after.backupId).toBeGreaterThan(0);
  });

  it("write rejects with StaleMtimeError when on-disk mtime moved", async () => {
    const file = path.join(tmpHome, "rules/b.md");
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, "v1\n");

    await expect(
      writeFile(db, tmpHome, SCOPE, "rules/b.md", "v2\n", 0),
    ).rejects.toBeInstanceOf(StaleMtimeError);
  });

  it("write captures the previous content as a backup in the right scope", async () => {
    const file = path.join(tmpHome, "rules/c.md");
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, "old\n");
    const before = await readFile(tmpHome, "rules/c.md");

    await writeFile(db, tmpHome, SCOPE, "rules/c.md", "new\n", before.mtime);

    const backups = listBackups(db, SCOPE, "rules/c.md");
    expect(backups).toHaveLength(1);
    expect(backups[0]?.content).toBe("old\n");
    expect(backups[0]?.scope).toBe(SCOPE);

    // A different scope sees no history for the same relPath
    expect(listBackups(db, "project:agm", "rules/c.md")).toEqual([]);
  });

  it("write refuses to leave the claude home", async () => {
    await expect(
      writeFile(db, tmpHome, SCOPE, "../escape.md", "x", 0),
    ).rejects.toThrow();
  });

  describe("createFile", () => {
    it("creates a new .md file with parents", async () => {
      const result = await createFile(
        db,
        tmpHome,
        "skills/new-skill.md",
        "---\nname: x\n---\nbody",
      );
      expect(result.path).toBe("skills/new-skill.md");
      expect(result.frontmatter).toEqual({ name: "x" });
      expect(result.content.trim()).toBe("body");
      expect(fs.existsSync(path.join(tmpHome, "skills/new-skill.md"))).toBe(true);
    });

    it("rejects when the target already exists", async () => {
      fs.mkdirSync(path.join(tmpHome, "rules"));
      fs.writeFileSync(path.join(tmpHome, "rules/dup.md"), "old");
      await expect(
        createFile(db, tmpHome, "rules/dup.md", "new"),
      ).rejects.toBeInstanceOf(FileAlreadyExistsError);
    });

    it("rejects non-.md extensions", async () => {
      await expect(
        createFile(db, tmpHome, "rules/x.txt", "x"),
      ).rejects.toBeInstanceOf(InvalidFileExtensionError);
    });

    it("refuses paths that escape claude home", async () => {
      await expect(createFile(db, tmpHome, "../escape.md", "x")).rejects.toThrow();
    });

    it("does not create a backup row (no previous content)", async () => {
      await createFile(db, tmpHome, "rules/fresh.md", "v1");
      expect(listBackups(db, SCOPE, "rules/fresh.md")).toEqual([]);
    });
  });
});
