import fs from "node:fs/promises";
import path from "node:path";
import { getClaudeHome } from "../claude-fs/path";
import { discoverProjects, type DiscoveredProject } from "../projects/discover";
import type { Db } from "../../db";
import type { ClaudeMdEntry, ClaudeMdType } from "./types";

/**
 * Subdir 재귀 검출의 자동 제외 폴더. node_modules / build artifact / 빌드
 * cache 등 — 사용자가 CLAUDE.md 를 의도적으로 둘 위치가 아닌 곳. \`.gitignore\`
 * 파싱은 별도 작업이라 일단 보편적인 목록만.
 */
export const SUBDIR_EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "target",
  "out",
  "vendor",
]);

/** Subdir 탐색 최대 깊이 (project root 기준). */
export const SUBDIR_MAX_DEPTH = 5;

interface StatResult {
  exists: boolean;
  size: number;
  modifiedAt: number;
  preview: string | null;
}

async function firstMeaningfulLine(filePath: string): Promise<string | null> {
  try {
    // CLAUDE.md 가 1MB 넘는 일은 거의 없지만 안전하게 처음 64KB 만 읽음.
    const fd = await fs.open(filePath, "r");
    try {
      const buf = Buffer.alloc(64 * 1024);
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
      const raw = buf.subarray(0, bytesRead).toString("utf8");
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        const t = line.trim();
        if (t.length === 0) continue;
        if (
          t === "---" ||
          t.startsWith("name:") ||
          t.startsWith("description:") ||
          t.startsWith("type:")
        ) {
          continue;
        }
        return t.length > 160 ? `${t.slice(0, 160)}…` : t;
      }
      return null;
    } finally {
      await fd.close();
    }
  } catch {
    return null;
  }
}

async function statFile(filePath: string): Promise<StatResult> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return { exists: false, size: 0, modifiedAt: 0, preview: null };
    }
    return {
      exists: true,
      size: stat.size,
      modifiedAt: stat.mtimeMs,
      preview: await firstMeaningfulLine(filePath),
    };
  } catch {
    return { exists: false, size: 0, modifiedAt: 0, preview: null };
  }
}

/**
 * Project root 아래 재귀 walk 로 \`CLAUDE.md\` 파일들을 찾음. root 의 CLAUDE.md
 * 는 team type 이 이미 처리하므로 \`relPath === ""\` 레벨의 파일은 skip
 * (디렉토리만 재귀). dot-dirs / 자동 제외 폴더 / 깊이 초과는 건너뜀.
 *
 * 반환: project root 기준 상대 경로의 배열 (예: \`["docs/CLAUDE.md", "apps/web/CLAUDE.md"]\`).
 */
export async function findSubdirClaudeMd(
  projectAbsolutePath: string,
  relPath = "",
  depth = 0,
): Promise<string[]> {
  if (depth > SUBDIR_MAX_DEPTH) return [];
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = await fs.readdir(path.join(projectAbsolutePath, relPath), {
      withFileTypes: true,
    });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SUBDIR_EXCLUDED_DIRS.has(e.name)) continue;
      if (e.name.startsWith(".")) continue;
      const sub = relPath ? path.join(relPath, e.name) : e.name;
      const found = await findSubdirClaudeMd(projectAbsolutePath, sub, depth + 1);
      out.push(...found);
    } else if (e.isFile() && e.name === "CLAUDE.md" && relPath !== "") {
      out.push(path.join(relPath, e.name));
    }
  }
  return out;
}

async function buildEntry(
  type: ClaudeMdType,
  filePath: string,
  project?: DiscoveredProject,
): Promise<ClaudeMdEntry> {
  const s = await statFile(filePath);
  const key =
    type === "global" ? "global" : `${type}:${project?.slug ?? "unknown"}`;
  return {
    key,
    type,
    filePath,
    exists: s.exists,
    preview: s.preview,
    size: s.size,
    modifiedAt: s.modifiedAt,
    projectSlug: project?.slug,
    projectName: project?.name,
    projectAbsolutePath: project?.absolutePath,
  };
}

/**
 * 3 위치 스캔 — 발견 여부와 무관하게 모두 반환. UI 가 \`exists=false\` 인
 * 자리도 \"여기 만들 수 있음\" 으로 그릴 수 있게.
 *
 * 순서: global → 각 프로젝트 team/personal 쌍.
 */
export async function discoverClaudeMd(db: Db): Promise<ClaudeMdEntry[]> {
  const out: ClaudeMdEntry[] = [];

  const globalPath = path.join(getClaudeHome(), "CLAUDE.md");
  out.push(await buildEntry("global", globalPath));

  const projects: DiscoveredProject[] = await discoverProjects(db);
  for (const p of projects) {
    const team = path.join(p.absolutePath, "CLAUDE.md");
    const personal = path.join(p.absolutePath, "CLAUDE.local.md");
    out.push(await buildEntry("team", team, p));
    out.push(await buildEntry("personal", personal, p));

    // subdir 재귀 — 발견된 파일만 entry 화 (\`exists\` 늘 true 가정).
    const subPaths = await findSubdirClaudeMd(p.absolutePath);
    for (const subPath of subPaths) {
      const filePath = path.join(p.absolutePath, subPath);
      const s = await statFile(filePath);
      out.push({
        key: `subdir:${p.slug}:${subPath}`,
        type: "subdir",
        filePath,
        exists: s.exists,
        preview: s.preview,
        size: s.size,
        modifiedAt: s.modifiedAt,
        projectSlug: p.slug,
        projectName: p.name,
        projectAbsolutePath: p.absolutePath,
        subPath,
      });
    }
  }

  return out;
}
