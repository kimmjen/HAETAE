import "./env";
import fs from "node:fs";
import path from "node:path";
import { openDb, runMigrations, type Db } from "./db";
import { getDataDir } from "./db/path";
import { discoverProjects, canonicalizeProjectPath } from "./services/projects/discover";
import { getProjectWiki, generateProjectWiki, countPending } from "./services/memory/wiki";
import { cascadeStaleDerived } from "./services/memory/cascade";
import { reExportVaultIfExists } from "./services/memory/vault";
import { acquireFoldLock } from "./services/memory/fold-lock";
import { DEFAULT_MODEL, type ClaudeModel } from "./services/memory/claude-cli";

/**
 * Server-independent "fold this project's brain" command, invoked by the
 * Claude Code SessionEnd hook with the session's cwd. It ties freshness to
 * actual work: when you finish a session, the wiki folds the new messages and
 * the derived layers (notes/ontology/eval) cascade — so the NEXT session's
 * CLAUDE.md injection and MCP recall are current, with no always-on server.
 *
 * SessionEnd cannot block, so the hook spawns this detached; it runs async
 * after the session exits. Opens its own cache.db (like the MCP server).
 *
 * Guarded so it doesn't burn LLM calls on every trivial session:
 *   - only known projects (in HAETAE_PROJECT_ROOTS / registered roots)
 *   - only when enough new messages have accrued (MIN_DELTA)
 *   - not within COOLDOWN_MS of the last fold
 *   - a per-project lock prevents concurrent folds
 */

const MIN_DELTA = Number(process.env.HAETAE_SESSION_FOLD_MIN_DELTA ?? 30);
const COOLDOWN_MS = Number(process.env.HAETAE_SESSION_FOLD_COOLDOWN_MS ?? 20 * 60 * 1000);

export interface FoldGuardInput {
  pending: number;
  wikiExists: boolean;
  wikiGeneratedAt: number | null;
  now: number;
  minDelta?: number;
  cooldownMs?: number;
}

/** Pure: decide whether a session-end fold is worth an LLM call right now. */
export function shouldFold(i: FoldGuardInput): { run: boolean; reason: string } {
  const minDelta = i.minDelta ?? MIN_DELTA;
  const cooldownMs = i.cooldownMs ?? COOLDOWN_MS;
  if (i.wikiExists && i.wikiGeneratedAt !== null && i.now - i.wikiGeneratedAt < cooldownMs) {
    const mins = Math.round((i.now - i.wikiGeneratedAt) / 60000);
    return { run: false, reason: `cooldown (folded ${mins}m ago < ${Math.round(cooldownMs / 60000)}m)` };
  }
  if (i.pending < minDelta) return { run: false, reason: `only ${i.pending} new msgs (< ${minDelta})` };
  return { run: true, reason: `${i.pending} new msgs` };
}

/**
 * Pure: pick the known project root that contains `cwd` — the longest matching
 * prefix, so running Claude Code in a subdirectory still folds the right
 * project. Inputs must already be canonicalized. null when cwd is under no
 * known root.
 */
export function resolveProjectRoot(cwd: string, knownRoots: string[]): string | null {
  const matches = knownRoots
    .filter((r) => cwd === r || cwd.startsWith(r.endsWith("/") ? r : r + "/"))
    .sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
}

function log(dataDir: string, msg: string): void {
  try {
    fs.appendFileSync(path.join(dataDir, "brain-update.log"), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    /* logging is best-effort */
  }
}

async function main(): Promise<void> {
  // Prefer the env var — pnpm's `-- <arg>` forwarding to a run-script is
  // unreliable across versions, but env vars pass through cleanly. argv is the
  // fallback for direct invocation / tests.
  const rawCwd = process.env.HAETAE_FOLD_CWD ?? process.argv[2];
  if (!rawCwd) process.exit(0);

  const db: Db = openDb();
  runMigrations(db);
  const dataDir = getDataDir();

  const cwd = canonicalizeProjectPath(rawCwd);
  const projects = await discoverProjects(db);
  const root = resolveProjectRoot(cwd, projects.map((p) => p.absolutePath));
  if (!root) {
    log(dataDir, `skip: ${cwd} is under no known project root`);
    process.exit(0);
  }

  const wiki = getProjectWiki(root, db);
  const pending = wiki ? wiki.pendingMessages : countPending(db, root, 0, "");
  const guard = shouldFold({
    pending,
    wikiExists: !!wiki,
    wikiGeneratedAt: wiki?.generatedAt ?? null,
    now: Date.now(),
  });
  if (!guard.run) {
    log(dataDir, `skip ${root}: ${guard.reason}`);
    process.exit(0);
  }

  // The single machine-wide fold lock (shared with the server's auto
  // scheduler) — only one fold runs at a time across every project and every
  // process. A skipped fold is fine: the project folds on its next session-end
  // (or the scheduler catches it).
  const lock = acquireFoldLock();
  if (!lock) {
    log(dataDir, `skip ${root}: another fold holds the lock`);
    process.exit(0);
  }

  const model: ClaudeModel = DEFAULT_MODEL;
  try {
    log(dataDir, `fold start ${root} (${guard.reason})`);
    const r = await generateProjectWiki(root, model, db);
    log(dataDir, `wiki ${root}: folded ${r.foldedMessages}, pending ${r.pendingMessages}, noChange ${r.noChange}`);
    // JSON.stringify(Error) is "{}" — flatten errors to their message so the
    // log actually says WHY a cascade layer failed (a notes timeout was
    // undiagnosable before this).
    const flat = (o: unknown): string =>
      JSON.stringify(o, (_k, v) => (v instanceof Error ? v.message : v));
    const refreshed = await cascadeStaleDerived(root, model, db, {
      info: (o, m) => log(dataDir, `cascade ${m} ${flat(o)}`),
      error: (o, m) => log(dataDir, `cascade ERROR ${m} ${flat(o)}`),
    });
    log(dataDir, `cascade ${root}: refreshed [${refreshed.join(", ")}]`);
    // Keep an already-exported Obsidian vault in sync with the fresh brain.
    const vault = await reExportVaultIfExists(root, db);
    if (vault.exported) log(dataDir, `vault ${root}: re-exported ${vault.files} files`);
  } catch (err) {
    log(dataDir, `ERROR ${root}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    lock.release();
  }
  process.exit(0);
}

// Only run when executed directly (not when imported by the unit tests).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
