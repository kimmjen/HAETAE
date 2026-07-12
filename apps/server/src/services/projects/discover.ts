import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import { asc } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { projectRoots } from "../../db/schema";
import { getClaudeHome } from "../claude-fs/path";

const ENV_VAR = "HAETAE_PROJECT_ROOTS";

export type RootSource = "env" | "user";

/**
 * Fix a path's CASING to the true on-disk casing, segment by segment, so it
 * matches how the session indexer stored `session_messages.project_path`.
 *
 * macOS is case-insensitive: a root added as ".../Github/Proj" resolves the
 * same directory as ".../GitHub/Proj" on the FS (so hasSession etc. pass), but
 * mismatches the case-SENSITIVE SQLite project_path — silently breaking wiki /
 * notes / recall for that project ("No session messages found").
 *
 * Deliberately does NOT resolve symlinks (unlike realpath): Claude Code records
 * the logical cwd, so a symlinked project root must keep its symlink path to
 * match. Unknown segments are kept verbatim (path may not exist on disk yet).
 */
export function canonicalizeProjectPath(p: string): string {
  const segments = path.resolve(p).split(path.sep).filter(Boolean);
  let cur: string = path.sep;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      return path.join(cur, ...segments.slice(i)); // not readable — keep the rest as-is
    }
    const real = entries.includes(seg) ? seg : entries.find((e) => e.toLowerCase() === seg.toLowerCase());
    if (!real) return path.join(cur, ...segments.slice(i)); // segment doesn't exist — keep the rest
    cur = path.join(cur, real);
  }
  return cur;
}

export interface DiscoveredProject {
  /** Stable identifier derived from the absolute path. URL-safe. */
  slug: string;
  /** Display name (basename, original case). */
  name: string;
  /** Absolute on-disk path. */
  absolutePath: string;
  /** True iff `<absolutePath>/.claude/` exists and is a directory. */
  hasClaudeDir: boolean;
  /** True iff Claude Code has at least one session log on disk for this
      cwd (`~/.claude/projects/<encoded-cwd>/*.jsonl`). UI uses this to
      decide between `claude` (new) and `claude --continue` (resume). */
  hasSession: boolean;
  /** Where this entry came from. env wins on collision. */
  source: RootSource;
  /** DB id when source === "user", undefined for env. */
  id?: number;
}

/**
 * Read project roots out of the HAETAE_PROJECT_ROOTS env. Colon-separated
 * paths matching POSIX PATH conventions. Empty entries and pure whitespace
 * are dropped, paths are resolved to absolute, and duplicates collapse.
 *
 * Designed to be reread per request (no module-level cache) so changes to
 * .env.local during dev pick up on the next API call.
 */
export function getProjectRoots(): string[] {
  const raw = process.env[ENV_VAR];
  if (!raw) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(":")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const abs = canonicalizeProjectPath(trimmed);
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/** All DB-resident user-added roots, oldest-added first. */
export function getUserRoots(db: Db = getDb()): Array<{ id: number; absolutePath: string }> {
  return db
    .select({ id: projectRoots.id, absolutePath: projectRoots.absolutePath })
    .from(projectRoots)
    .orderBy(asc(projectRoots.addedAt), asc(projectRoots.id))
    .all();
}

/**
 * Allowlist check: is `projectPath` one of the known project roots? Used to
 * gate write/spawn endpoints (e.g. wiki generation writes .claude/CLAUDE.md)
 * against arbitrary paths from request bodies. Compares resolved absolute
 * paths so `..` and trailing-slash variants can't slip through.
 */
export function isKnownProjectPath(knownAbsolutePaths: string[], projectPath: string): boolean {
  const target = canonicalizeProjectPath(projectPath);
  return knownAbsolutePaths.some((p) => canonicalizeProjectPath(p) === target);
}

/**
 * Merge env + DB sources into the canonical project list. env wins on
 * absolutePath collision (keeping its source/badge), DB rows attach their
 * id so the UI can DELETE them.
 */
export async function discoverProjects(db: Db = getDb()): Promise<DiscoveredProject[]> {
  const envRoots = getProjectRoots();
  const userRoots = getUserRoots(db);

  type Entry = { absolutePath: string; source: RootSource; id?: number };
  const seen = new Set<string>();
  const merged: Entry[] = [];

  for (const abs of envRoots) {
    if (seen.has(abs)) continue;
    seen.add(abs);
    merged.push({ absolutePath: abs, source: "env" });
  }
  for (const row of userRoots) {
    const abs = canonicalizeProjectPath(row.absolutePath);
    if (seen.has(abs)) continue;
    seen.add(abs);
    merged.push({ absolutePath: abs, source: "user", id: row.id });
  }

  const result: DiscoveredProject[] = [];
  const slugSeen = new Map<string, number>();

  for (const entry of merged) {
    const baseName = path.basename(entry.absolutePath) || entry.absolutePath;
    const baseSlug = slugify(baseName);
    const count = slugSeen.get(baseSlug) ?? 0;
    const finalSlug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
    slugSeen.set(baseSlug, count + 1);

    result.push({
      slug: finalSlug,
      name: baseName,
      absolutePath: entry.absolutePath,
      hasClaudeDir: await pathIsDirectory(path.join(entry.absolutePath, ".claude")),
      hasSession: await hasClaudeSession(entry.absolutePath),
      source: entry.source,
      ...(entry.id !== undefined ? { id: entry.id } : {}),
    });
  }

  return result;
}

/**
 * Claude Code mirrors every cwd into `~/.claude/projects/<encoded>/`,
 * encoding `/` as `-`. A session is "present" iff that directory has at
 * least one `.jsonl` file. Any FS error (missing dir, permission) is
 * treated as "no session" — never throw, never block the listing.
 */
async function hasClaudeSession(absPath: string): Promise<boolean> {
  const encoded = absPath.replace(/\//g, "-");
  const sessionDir = path.join(getClaudeHome(), "projects", encoded);
  try {
    const entries = await fs.readdir(sessionDir);
    return entries.some((name) => name.endsWith(".jsonl"));
  } catch {
    return false;
  }
}

function slugify(name: string): string {
  const lowered = name.toLowerCase();
  const cleaned = lowered.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "project";
}

async function pathIsDirectory(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
