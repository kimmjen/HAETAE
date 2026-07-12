import path from "node:path";

/**
 * Load apps/server/.env.local into process.env — docs point users here for
 * HAETAE_* flags and secrets, but nothing actually loaded the file until now.
 * Must be the FIRST import of every entrypoint so it runs before any module
 * reads process.env at module level (e.g. claude-cli's MAX_CONCURRENT).
 * Node's built-in loader (no dotenv dep); real environment variables win over
 * file values, matching --env-file semantics. Missing file is fine.
 */
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../.env.local"));
} catch {
  // no .env.local — defaults only
}
