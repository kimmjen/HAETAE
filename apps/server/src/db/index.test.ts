import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, schema } from "./index";

describe("openDb + runMigrations", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-db-"));
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the database file under the requested directory", () => {
    const dbPath = path.join(tmpDir, "cache.db");
    const db = openDb({ filePath: dbPath });
    runMigrations(db);
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it("supports an in-memory database for tests", () => {
    const db = openDb({ filePath: ":memory:" });
    runMigrations(db);

    db.insert(schema.projectRoots)
      .values({ absolutePath: "/tmp/p" })
      .run();

    const all = db.select().from(schema.projectRoots).all();
    expect(all).toHaveLength(1);
  });
});
