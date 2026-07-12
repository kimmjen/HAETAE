import fs from "node:fs/promises";
import { assertSafePath } from "./guard";
import { readTree, type TreeEntry } from "./tree";

export interface SearchMatch {
  line: number;
  text: string;
}

export interface SearchResult {
  path: string;
  matches: SearchMatch[];
}

const MAX_MATCHES_PER_FILE = 5;
const MAX_FILES = 50;
const TEXT_TRUNCATE = 200;

/**
 * Substring grep across every .md file under the rules tree
 * (CLAUDE.md + rules / skills / agents / commands) within `home`.
 * Case-insensitive.
 *
 * Returns at most MAX_FILES files, MAX_MATCHES_PER_FILE matches per file.
 * Matched lines are truncated to TEXT_TRUNCATE chars centered on the
 * match so the UI can render a readable snippet.
 *
 * Frontmatter participates because we grep the raw file contents — no
 * separate parse step.
 */
export async function searchTree(home: string, query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const tree = await readTree(home);
  const filePaths = collectFilePaths(tree);
  const lowerQ = trimmed.toLowerCase();
  const results: SearchResult[] = [];

  for (const relPath of filePaths) {
    if (results.length >= MAX_FILES) break;
    const abs = assertSafePath(home, relPath);
    let content: string;
    try {
      content = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }
    const matches = grep(content, lowerQ).slice(0, MAX_MATCHES_PER_FILE);
    if (matches.length > 0) {
      results.push({ path: relPath, matches });
    }
  }

  return results;
}

function collectFilePaths(tree: TreeEntry[]): string[] {
  const out: string[] = [];
  function walk(entries: TreeEntry[]): void {
    for (const e of entries) {
      if (e.type === "file") out.push(e.path);
      else if (e.children) walk(e.children);
    }
  }
  walk(tree);
  return out;
}

function grep(content: string, lowerQuery: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i]!.toLowerCase();
    if (lower.includes(lowerQuery)) {
      matches.push({ line: i + 1, text: truncate(lines[i]!, lower, lowerQuery) });
    }
  }
  return matches;
}

function truncate(line: string, lowerLine: string, lowerQuery: string): string {
  if (line.length <= TEXT_TRUNCATE) return line;
  const idx = lowerLine.indexOf(lowerQuery);
  const start = Math.max(0, idx - 50);
  const end = Math.min(line.length, idx + lowerQuery.length + 150);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < line.length ? "…" : "";
  return prefix + line.slice(start, end) + suffix;
}
