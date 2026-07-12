import fs from "node:fs/promises";
import path from "node:path";
import { getClaudeHome } from "../claude-fs/path";

/**
 * Per-project auto-memory. Claude Code 가 \`~/.claude/projects/<encoded>/
 * memory/\` 에 사용자별 메모리 파일을 저장. MEMORY.md 가 인덱스, 그 외
 * \`<topic>.md\` 들이 개별 메모리.
 *
 * 디테일 근거: docs/research/claude-code-data-sources.md.
 */
export interface ProjectMemoryEntry {
  name: string;
  /** 첫 줄 미리보기 — 빈 줄/주석 줄 스킵 후 첫 의미있는 한 줄. */
  preview: string | null;
  /** Bytes. */
  size: number;
  modifiedAt: number;
}

/** Lossy encoding mirror of Claude Code's projects dir naming (`/` → `-`). */
function encode(absolutePath: string): string {
  return absolutePath.replace(/\//g, "-");
}

async function firstMeaningfulLine(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (t.length === 0) continue;
      if (t.startsWith("---") || t.startsWith("name:") || t.startsWith("description:") || t.startsWith("type:")) {
        // frontmatter 헤더는 건너뜀 (auto-memory 가 frontmatter 를 씀)
        continue;
      }
      // 너무 길면 자르기
      return t.length > 160 ? `${t.slice(0, 160)}…` : t;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Memory dir 내부에서 안전한 파일명만 허용. \`..\` 또는 \`/\` 가 들어간
 * 입력은 거부 — 외부 디렉터리 escape 방지.
 */
function safeMemoryName(name: string): boolean {
  if (name.length === 0 || name.length > 256) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  if (name.startsWith(".")) return false;
  return name.endsWith(".md");
}

export async function readProjectMemoryFile(
  projectAbsolutePath: string,
  fileName: string,
): Promise<{ content: string; size: number; modifiedAt: number } | null> {
  if (!safeMemoryName(fileName)) return null;
  const dir = path.join(
    getClaudeHome(),
    "projects",
    encode(projectAbsolutePath),
    "memory",
  );
  const abs = path.join(dir, fileName);
  // Defense in depth: resolved path must remain inside the dir.
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) return null;
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  // Cap at 1 MB so a runaway file can't blow up the response.
  if (stat.size > 1_000_000) {
    const fd = await fs.open(resolved, "r");
    try {
      const buf = Buffer.alloc(1_000_000);
      await fd.read(buf, 0, 1_000_000, 0);
      return {
        content: `${buf.toString("utf8")}\n\n[truncated — ${stat.size} bytes total]`,
        size: stat.size,
        modifiedAt: stat.mtimeMs,
      };
    } finally {
      await fd.close();
    }
  }
  const content = await fs.readFile(resolved, "utf8");
  return { content, size: stat.size, modifiedAt: stat.mtimeMs };
}

export async function listProjectMemory(
  projectAbsolutePath: string,
): Promise<ProjectMemoryEntry[]> {
  const dir = path.join(
    getClaudeHome(),
    "projects",
    encode(projectAbsolutePath),
    "memory",
  );
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const out: ProjectMemoryEntry[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const abs = path.join(dir, name);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    out.push({
      name,
      preview: await firstMeaningfulLine(abs),
      size: stat.size,
      modifiedAt: stat.mtimeMs,
    });
  }

  // MEMORY.md 를 맨 앞으로 (인덱스 역할), 나머지 알파벳 순.
  out.sort((a, b) => {
    if (a.name === "MEMORY.md") return -1;
    if (b.name === "MEMORY.md") return 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}
