import fs from "node:fs/promises";
import path from "node:path";
import { assertSafePath } from "./guard";

export interface TreeEntry {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: TreeEntry[];
}

/**
 * Content categories surfaced in the rules tree. ADR 0007 defines
 * "rules" and "skills" as the two user-facing categories — agents/
 * and commands/ stay reachable through the unfiltered call but no
 * top-level nav targets them yet.
 */
export type TreeCategory = "rules" | "skills";

export interface ReadTreeOptions {
  category?: TreeCategory;
}

const ROOT_FILE = "CLAUDE.md";
const ROOT_DIRS = ["rules", "skills", "agents", "commands"] as const;
const HIDDEN_PREFIX = ".";

/**
 * Read the relevant slice of a Claude home as a tree.
 *
 * Without a `category` option:
 * - CLAUDE.md at the root (if present)
 * - rules/ skills/ agents/ commands/ directories (if present)
 *
 * With `category="rules"`:
 * - CLAUDE.md + rules/ only
 *
 * With `category="skills"`:
 * - skills/ only (no CLAUDE.md, no other dirs)
 *
 * Inside those directories every .md file and subdirectory is walked
 * recursively. Hidden entries (.DS_Store, .git, ...) are skipped. If
 * the Claude home does not exist the function returns an empty array
 * rather than throwing — newcomers shouldn't see a stack trace just
 * because they have not run Claude Code yet, and project repos that
 * never used it should still resolve cleanly.
 */
export async function readTree(
  home: string,
  options: ReadTreeOptions = {},
): Promise<TreeEntry[]> {
  if (!(await pathExists(home))) return [];

  const { category } = options;
  const entries: TreeEntry[] = [];

  if (includesRoot(category)) {
    const rootMd = path.join(home, ROOT_FILE);
    if (await pathIsFile(rootMd)) {
      entries.push({ name: ROOT_FILE, type: "file", path: ROOT_FILE });
    }
  }

  for (const dir of ROOT_DIRS) {
    if (!includesDir(category, dir)) continue;
    const abs = path.join(home, dir);
    if (!(await pathIsDirectory(abs))) continue;
    entries.push({
      name: dir,
      type: "directory",
      path: dir,
      children: await walk(home, abs, dir),
    });
  }

  return entries;
}

function includesRoot(category: TreeCategory | undefined): boolean {
  // CLAUDE.md is part of the rules conceptual category. Skills view skips it.
  return category === undefined || category === "rules";
}

function includesDir(
  category: TreeCategory | undefined,
  dir: (typeof ROOT_DIRS)[number],
): boolean {
  if (category === undefined) return true;
  if (category === "rules") return dir === "rules";
  if (category === "skills") return dir === "skills";
  return false;
}

async function walk(home: string, absDir: string, relDir: string): Promise<TreeEntry[]> {
  const dirents = await fs.readdir(absDir, { withFileTypes: true });
  const out: TreeEntry[] = [];

  for (const dirent of dirents) {
    if (dirent.name.startsWith(HIDDEN_PREFIX)) continue;
    const childRel = path.posix.join(relDir, dirent.name);
    const childAbs = path.join(absDir, dirent.name);

    // Defense in depth: every path we hand back must round-trip the
    // safety check. This catches symlinks that point outside.
    try {
      assertSafePath(home, childRel);
    } catch {
      continue;
    }

    if (dirent.isDirectory()) {
      out.push({
        name: dirent.name,
        type: "directory",
        path: childRel,
        children: await walk(home, childAbs, childRel),
      });
    } else if (dirent.isFile() && dirent.name.endsWith(".md")) {
      out.push({
        name: dirent.name,
        type: "file",
        path: childRel,
      });
    }
  }

  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return out;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function pathIsFile(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function pathIsDirectory(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}
