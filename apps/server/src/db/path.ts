import path from "node:path";
import envPaths from "env-paths";

const PATHS = envPaths("haetae", { suffix: "" });

/**
 * Directory that holds the SQLite cache and other Haetae state files.
 * Override with HAETAE_DB_PATH (which is interpreted as the directory
 * containing cache.db, not the file path itself).
 */
export function getDataDir(): string {
  const override = process.env.HAETAE_DB_PATH;
  if (override && override.length > 0) return path.resolve(override);
  return PATHS.data;
}

/**
 * Absolute path to the SQLite database file.
 */
export function getDbFilePath(): string {
  return path.join(getDataDir(), "cache.db");
}

/**
 * Where drizzle-kit places generated migrations. Resolved at runtime so the
 * server still finds them after `tsc` builds into dist/.
 */
export function getMigrationsDir(): string {
  return path.resolve(import.meta.dirname, "../../drizzle");
}
