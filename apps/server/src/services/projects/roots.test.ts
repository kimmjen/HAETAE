import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import {
  DuplicateRootError,
  InvalidPathError,
  RootNotFoundError,
  addProjectRoot,
  deleteProjectRoot,
} from "./roots";

const ENV = "HAETAE_PROJECT_ROOTS";

describe("addProjectRoot", () => {
  let db: Db;
  let tmp: string;
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV];
    process.env[ENV] = "";
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-roots-"));
  });

  afterEach(() => {
    closeDb();
    if (original === undefined) delete process.env[ENV];
    else process.env[ENV] = original;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("accepts a real absolute directory and inserts it", async () => {
    const row = await addProjectRoot(db, tmp);
    expect(row.id).toBeGreaterThan(0);
    expect(row.absolutePath).toBe(path.resolve(tmp));
  });

  it("rejects an empty path", async () => {
    await expect(addProjectRoot(db, "   ")).rejects.toBeInstanceOf(InvalidPathError);
  });

  it("rejects a relative path", async () => {
    await expect(addProjectRoot(db, "./relative")).rejects.toBeInstanceOf(
      InvalidPathError,
    );
  });

  it("rejects a non-existent absolute path", async () => {
    await expect(
      addProjectRoot(db, path.join(tmp, "does-not-exist")),
    ).rejects.toBeInstanceOf(InvalidPathError);
  });

  it("rejects a path that points to a file rather than a directory", async () => {
    const file = path.join(tmp, "file.txt");
    fs.writeFileSync(file, "x");
    await expect(addProjectRoot(db, file)).rejects.toBeInstanceOf(InvalidPathError);
  });

  it("rejects a path already covered by HAETAE_PROJECT_ROOTS env", async () => {
    process.env[ENV] = tmp;
    try {
      await addProjectRoot(db, tmp);
      expect.fail("expected DuplicateRootError");
    } catch (err) {
      expect(err).toBeInstanceOf(DuplicateRootError);
      expect((err as DuplicateRootError).source).toBe("env");
    }
  });

  it("rejects a path already in the DB", async () => {
    await addProjectRoot(db, tmp);
    try {
      await addProjectRoot(db, tmp);
      expect.fail("expected DuplicateRootError");
    } catch (err) {
      expect(err).toBeInstanceOf(DuplicateRootError);
      expect((err as DuplicateRootError).source).toBe("user");
    }
  });
});

describe("deleteProjectRoot", () => {
  let db: Db;
  let tmp: string;

  beforeEach(() => {
    process.env[ENV] = "";
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-roots-del-"));
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("removes the row by id", async () => {
    const row = await addProjectRoot(db, tmp);
    expect(() => deleteProjectRoot(db, row.id)).not.toThrow();
    expect(() => deleteProjectRoot(db, row.id)).toThrow(RootNotFoundError);
  });

  it("throws RootNotFoundError when the id is unknown", () => {
    expect(() => deleteProjectRoot(db, 999_999)).toThrow(RootNotFoundError);
  });
});
