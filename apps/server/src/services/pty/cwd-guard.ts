import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getClaudeHome } from "../claude-fs/path";
import { getProjectRoots, getUserRoots } from "../projects/discover";

export class CwdNotAllowedError extends Error {
  constructor(public readonly attempted: string) {
    super(`cwd not allowed: ${attempted}`);
    this.name = "CwdNotAllowedError";
  }
}

export class CwdInvalidError extends Error {
  constructor(public readonly attempted: string, message: string) {
    super(message);
    this.name = "CwdInvalidError";
  }
}

/**
 * Validate the cwd a user wants to spawn a PTY in. Allowed prefixes:
 *
 * - the user's claude home (`~/.claude` or `HAETAE_CLAUDE_HOME` override)
 * - every project root from `HAETAE_PROJECT_ROOTS` env (P2.5a)
 * - every project root from the `project_roots` DB table (P2.5c)
 *
 * Note: this is only a *spawn-time* check. Once the PTY is alive the user
 * can `cd` anywhere their shell can reach — that's the user's machine
 * and the user's privilege, not ours to police further.
 */
export async function validateCwd(
  cwd: string | undefined,
  options: { db?: import("../../db").Db } = {},
): Promise<string> {
  // Default to the claude home — always-allowed and meaningful.
  const raw = cwd && cwd.length > 0 ? cwd : getClaudeHome();
  // Friendly: shells expand ~ to $HOME — do the same here so URL params
  // like `?cwd=~/.claude` work without users having to absolute-encode.
  const candidate = expandHome(raw);

  if (!path.isAbsolute(candidate)) {
    throw new CwdInvalidError(candidate, "cwd must be absolute");
  }

  let stat;
  try {
    stat = await fs.stat(candidate);
  } catch {
    throw new CwdInvalidError(candidate, "cwd does not exist");
  }
  if (!stat.isDirectory()) {
    throw new CwdInvalidError(candidate, "cwd is not a directory");
  }

  const resolved = path.resolve(candidate);
  const allowed = await collectAllowedRoots(options.db);
  const ok = allowed.some((root) => isInside(resolved, root));
  if (!ok) {
    throw new CwdNotAllowedError(candidate);
  }
  return resolved;
}

/** The HAETAE checkout this server runs from — always spawnable. The server
 *  already executes code from here, so a shell in it grants nothing new; this
 *  keeps flows like the NotebookLM re-auth (cwd = apps/notebooklm) working on
 *  installs where the repo itself isn't registered as a project root. */
function ownRepoRoot(): string {
  // this file: <repo>/apps/server/src/services/pty/cwd-guard.ts → five up.
  return path.resolve(import.meta.dirname, "..", "..", "..", "..", "..");
}

async function collectAllowedRoots(db?: import("../../db").Db): Promise<string[]> {
  const out = new Set<string>();
  out.add(path.resolve(getClaudeHome()));
  out.add(ownRepoRoot());
  for (const r of getProjectRoots()) out.add(path.resolve(r));
  if (db) {
    for (const row of getUserRoots(db)) out.add(path.resolve(row.absolutePath));
  }
  return [...out];
}

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function isInside(target: string, root: string): boolean {
  if (target === root) return true;
  const rel = path.relative(root, target);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}
