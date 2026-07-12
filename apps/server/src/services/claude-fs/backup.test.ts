import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { hashContent, listBackups, saveBackup } from "./backup";

const G = "global";
const P = "project:agm";

describe("backup", () => {
  let db: Db;

  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
  });

  it("hashContent is stable per input", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
    expect(hashContent("hello")).not.toBe(hashContent("world"));
  });

  it("inserts a row when no prior backup exists", () => {
    const row = saveBackup(db, G, "rules/a.md", "v1");
    expect(row.id).toBeGreaterThan(0);
    expect(row.filePath).toBe("rules/a.md");
    expect(row.content).toBe("v1");
    expect(row.scope).toBe(G);

    expect(listBackups(db, G, "rules/a.md")).toHaveLength(1);
  });

  it("dedupes consecutive identical content (no-op write)", () => {
    const a = saveBackup(db, G, "rules/a.md", "v1");
    const b = saveBackup(db, G, "rules/a.md", "v1");
    expect(b.id).toBe(a.id);
    expect(listBackups(db, G, "rules/a.md")).toHaveLength(1);
  });

  it("appends a new row when content changes", () => {
    saveBackup(db, G, "rules/a.md", "v1");
    saveBackup(db, G, "rules/a.md", "v2");
    saveBackup(db, G, "rules/a.md", "v3");
    const rows = listBackups(db, G, "rules/a.md");
    expect(rows.map((r) => r.content)).toEqual(["v3", "v2", "v1"]);
  });

  it("scopes history per path", () => {
    saveBackup(db, G, "rules/a.md", "v1");
    saveBackup(db, G, "rules/b.md", "v1");
    expect(listBackups(db, G, "rules/a.md")).toHaveLength(1);
    expect(listBackups(db, G, "rules/b.md")).toHaveLength(1);
  });

  it("isolates history per scope key — same relPath in two scopes is independent", () => {
    saveBackup(db, G, "CLAUDE.md", "global v1");
    saveBackup(db, P, "CLAUDE.md", "project v1");
    saveBackup(db, P, "CLAUDE.md", "project v2");

    expect(listBackups(db, G, "CLAUDE.md")).toHaveLength(1);
    expect(listBackups(db, P, "CLAUDE.md")).toHaveLength(2);
    expect(listBackups(db, G, "CLAUDE.md")[0]?.content).toBe("global v1");
    expect(listBackups(db, P, "CLAUDE.md")[0]?.content).toBe("project v2");
  });
});
