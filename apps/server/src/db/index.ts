import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { getDbFilePath, getMigrationsDir } from "./path";

export type Db = BetterSQLite3Database<typeof schema>;

let cachedDb: Db | null = null;
let cachedSqlite: Database.Database | null = null;

export interface OpenDbOptions {
  /** Override the on-disk file path. Use ":memory:" for tests. */
  filePath?: string;
}

export function openDb(options: OpenDbOptions = {}): Db {
  const filePath = options.filePath ?? getDbFilePath();
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  cachedSqlite = sqlite;
  cachedDb = db;
  return db;
}

export function getDb(): Db {
  if (!cachedDb) return openDb();
  return cachedDb;
}

export function runMigrations(db: Db = getDb()): void {
  migrate(db, { migrationsFolder: getMigrationsDir() });
}

export function closeDb(): void {
  if (cachedSqlite) {
    cachedSqlite.close();
    cachedSqlite = null;
    cachedDb = null;
  }
}

export { schema };
