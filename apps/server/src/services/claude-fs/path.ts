import os from "node:os";
import path from "node:path";

const DEFAULT_DIR = ".claude";

/**
 * Absolute path to the user's Claude Code home directory.
 * `HAETAE_CLAUDE_HOME` env overrides the default `~/.claude`.
 *
 * Resolved at call time so tests can flip the env per-case.
 */
export function getClaudeHome(): string {
  const override = process.env.HAETAE_CLAUDE_HOME;
  if (override && override.length > 0) return path.resolve(override);
  return path.join(os.homedir(), DEFAULT_DIR);
}
