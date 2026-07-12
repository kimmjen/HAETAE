import { eq } from "drizzle-orm";
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

  it("creates the app_state table with the expected columns", () => {
    const db = openDb({ filePath: path.join(tmpDir, "cache.db") });
    runMigrations(db);

    db.insert(schema.appState)
      .values({ key: "theme", value: "dark" })
      .run();

    const rows = db
      .select()
      .from(schema.appState)
      .where(eq(schema.appState.key, "theme"))
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe("theme");
    expect(rows[0]?.value).toBe("dark");
    expect(rows[0]?.updatedAt).toBeInstanceOf(Date);
  });

  it("supports an in-memory database for tests", () => {
    const db = openDb({ filePath: ":memory:" });
    runMigrations(db);

    db.insert(schema.appState)
      .values({ key: "k", value: "v" })
      .run();

    const all = db.select().from(schema.appState).all();
    expect(all).toHaveLength(1);
  });
});
