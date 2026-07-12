import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations } from "./index";

/**
 * File-based migration tests. The other suites use `:memory:` DBs so
 * they never see Drizzle's `__drizzle_migrations` hash bookkeeping —
 * that's exactly the gap that let P4.2 (#107) reach merge with a
 * migration which crashed at boot on the developer's real `.db` file
 * with `table 'usage_events' already exists`.
 *
 * These tests run the whole migrator against a real (temp) sqlite file:
 *
 *  1. fresh file → migrate → required tables exist
 *  2. same file → migrate again → no-op (idempotent)
 *  3. migration sql files line up with the recorded snapshots — a
 *     missing or extra hash in `__drizzle_migrations` means future
 *     schema PRs need to be regenerated cleanly.
 */

function listExpectedTables(): string[] {
  return [
    "app_state",
    "file_backups",
    "project_roots",
    "memories",
    "project_eval",
    "project_eval_history",
    "project_links",
    "project_notes",
    "project_ontology",
    "project_wiki",
    "project_wiki_history",
    "session_messages",
    "usage_api_events",
    "usage_events",
    "usage_file_cursor",
    "user_profile",
  ];
}

function tableNames(filePath: string): string[] {
  const sqlite = new Database(filePath, { readonly: true });
  try {
    const rows = sqlite
      .prepare(
        // Exclude the FTS5 virtual table + its shadow tables (session_messages_fts*)
        // — they're a search-index implementation detail, not logical schema.
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' AND name NOT LIKE 'session_messages_fts%'",
      )
      .all() as Array<{ name: string }>;
    return rows.map((r) => r.name).sort();
  } finally {
    sqlite.close();
  }
}

function migrationCount(filePath: string): number {
  const sqlite = new Database(filePath, { readonly: true });
  try {
    const row = sqlite
      .prepare("SELECT COUNT(*) as c FROM __drizzle_migrations")
      .get() as { c: number };
    return Number(row.c);
  } finally {
    sqlite.close();
  }
}

describe("runMigrations (file DB)", () => {
  it("creates every expected table on a fresh file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-mig-"));
    const filePath = path.join(dir, "cache.db");
    try {
      const db = openDb({ filePath });
      runMigrations(db);
      closeDb();

      expect(tableNames(filePath).sort()).toEqual(listExpectedTables().sort());
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is idempotent — running migrate twice leaves the DB unchanged", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-mig-"));
    const filePath = path.join(dir, "cache.db");
    try {
      runMigrations(openDb({ filePath }));
      closeDb();
      const tablesAfterFirst = tableNames(filePath);
      const migrationsAfterFirst = migrationCount(filePath);

      runMigrations(openDb({ filePath }));
      closeDb();

      expect(tableNames(filePath)).toEqual(tablesAfterFirst);
      expect(migrationCount(filePath)).toBe(migrationsAfterFirst);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records exactly one migration entry per .sql file in drizzle/", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-mig-"));
    const filePath = path.join(dir, "cache.db");
    try {
      runMigrations(openDb({ filePath }));
      closeDb();

      const sqlFiles = fs
        .readdirSync(path.resolve(import.meta.dirname, "../../drizzle"))
        .filter((f) => f.endsWith(".sql"));

      // If this fails after editing a migration, regenerate the whole
      // sequence (drizzle-kit generate) instead of hand-editing — the
      // mismatch is exactly what bit P4.2 (#107) on the dev machine.
      expect(migrationCount(filePath)).toBe(sqlFiles.length);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
