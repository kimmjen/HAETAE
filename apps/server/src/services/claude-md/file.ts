import fs from "node:fs/promises";
import path from "node:path";
import { getClaudeHome } from "../claude-fs/path";
import { saveBackup } from "../claude-fs/backup";
import { discoverProjects } from "../projects/discover";
import type { Db } from "../../db";
import type { ClaudeMdType } from "./types";
import { SUBDIR_EXCLUDED_DIRS, SUBDIR_MAX_DEPTH } from "./discover";

export class ClaudeMdPathDeniedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ClaudeMdPathDeniedError";
  }
}

export class ClaudeMdFileNotFoundError extends Error {
  constructor(public readonly filePath: string) {
    super(`CLAUDE.md not found: ${filePath}`);
    this.name = "ClaudeMdFileNotFoundError";
  }
}

export class ClaudeMdStaleMtimeError extends Error {
  constructor(public readonly diskMtime: number) {
    super(`disk file changed since last read (mtime=${diskMtime})`);
    this.name = "ClaudeMdStaleMtimeError";
  }
}

interface ResolvedTarget {
  filePath: string;
  scopeKey: string;
  relPath: string;
  projectSlug?: string;
}

/**
 * 화이트리스트: 들어온 (type, projectSlug) 가 실제 등록된 위치인지 검증 후
 * 절대경로 + 백업용 scope/relPath 반환. 어디서든 임의 경로 쓰기 못 하게.
 */
/**
 * Subdir 의 \`subPath\` 화이트리스트 — \`..\` / 절대경로 / 제외 폴더 / dot-dirs /
 * 깊이 초과 / 잘못된 basename 거부. discover 의 walk 규칙과 정합.
 */
function validateSubPath(subPath: string): void {
  if (subPath.length === 0) {
    throw new ClaudeMdPathDeniedError("subPath empty");
  }
  if (path.isAbsolute(subPath)) {
    throw new ClaudeMdPathDeniedError("subPath must be relative");
  }
  const segments = subPath.split(/[\\/]+/).filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new ClaudeMdPathDeniedError("subPath empty after normalize");
  }
  if (segments[segments.length - 1] !== "CLAUDE.md") {
    throw new ClaudeMdPathDeniedError("subPath basename must be CLAUDE.md");
  }
  if (segments.length > SUBDIR_MAX_DEPTH + 1) {
    throw new ClaudeMdPathDeniedError(
      `subPath depth > ${SUBDIR_MAX_DEPTH}`,
    );
  }
  for (const seg of segments) {
    if (seg === "..") throw new ClaudeMdPathDeniedError("'..' segment");
    if (seg === ".") throw new ClaudeMdPathDeniedError("'.' segment");
    // 마지막 (basename) 은 항상 CLAUDE.md 라 이미 위에서 검증됨.
    if (seg === segments[segments.length - 1]) continue;
    if (seg.startsWith(".")) {
      throw new ClaudeMdPathDeniedError(`dot-dir segment: ${seg}`);
    }
    if (SUBDIR_EXCLUDED_DIRS.has(seg)) {
      throw new ClaudeMdPathDeniedError(`excluded dir: ${seg}`);
    }
  }
}

export async function resolveTarget(
  db: Db,
  type: ClaudeMdType,
  projectSlug?: string,
  subPath?: string,
): Promise<ResolvedTarget> {
  if (type === "global") {
    const filePath = path.join(getClaudeHome(), "CLAUDE.md");
    return { filePath, scopeKey: "claude-md-global", relPath: "CLAUDE.md" };
  }

  if (!projectSlug) {
    throw new ClaudeMdPathDeniedError("projectSlug required");
  }

  const projects = await discoverProjects(db);
  const project = projects.find((p) => p.slug === projectSlug);
  if (!project) {
    throw new ClaudeMdPathDeniedError(`unknown project slug: ${projectSlug}`);
  }

  if (type === "team" || type === "personal") {
    const fileName = type === "team" ? "CLAUDE.md" : "CLAUDE.local.md";
    const filePath = path.join(project.absolutePath, fileName);
    const scopeKey = `claude-md-${type}:${project.slug}`;
    return { filePath, scopeKey, relPath: fileName, projectSlug };
  }

  // subdir
  if (!subPath) {
    throw new ClaudeMdPathDeniedError("subPath required for subdir");
  }
  validateSubPath(subPath);
  const normalized = subPath.replace(/\\/g, "/");
  const filePath = path.join(project.absolutePath, normalized);
  // Paranoid: 최종 resolve 후 root prefix 안인지.
  const resolved = path.resolve(filePath);
  const rootResolved = path.resolve(project.absolutePath);
  if (
    resolved !== rootResolved &&
    !resolved.startsWith(rootResolved + path.sep)
  ) {
    throw new ClaudeMdPathDeniedError("subPath escapes project root");
  }
  return {
    filePath: resolved,
    scopeKey: `claude-md-subdir:${project.slug}:${normalized}`,
    relPath: normalized,
    projectSlug,
  };
}

export interface ReadResult {
  content: string;
  size: number;
  modifiedAt: number;
}

export async function readClaudeMd(
  db: Db,
  type: ClaudeMdType,
  projectSlug?: string,
  subPath?: string,
): Promise<ReadResult> {
  const target = await resolveTarget(db, type, projectSlug, subPath);
  let stat;
  try {
    stat = await fs.stat(target.filePath);
  } catch {
    throw new ClaudeMdFileNotFoundError(target.filePath);
  }
  if (!stat.isFile()) {
    throw new ClaudeMdFileNotFoundError(target.filePath);
  }
  const content = await fs.readFile(target.filePath, "utf8");
  return { content, size: stat.size, modifiedAt: stat.mtimeMs };
}

export interface WriteOptions {
  /** 클라이언트가 마지막에 본 mtime. null/undefined 이면 새 파일 생성. */
  expectedMtime?: number | null;
}

export interface WriteResult {
  size: number;
  modifiedAt: number;
}

/**
 * 백업 → mtime 충돌 검증 → atomic write. claude-fs 의 \`saveBackup\` 을
 * 재사용해 \`file_backups\` 테이블에 이전 content 가 hash dedupe 와 함께
 * 보존됨.
 */
export async function writeClaudeMd(
  db: Db,
  type: ClaudeMdType,
  content: string,
  options: WriteOptions = {},
  projectSlug?: string,
  subPath?: string,
): Promise<WriteResult> {
  const target = await resolveTarget(db, type, projectSlug, subPath);

  let existingStat: { mtimeMs: number } | null = null;
  try {
    const s = await fs.stat(target.filePath);
    if (s.isFile()) existingStat = { mtimeMs: s.mtimeMs };
  } catch {
    // 새 파일.
  }

  if (existingStat) {
    if (
      options.expectedMtime !== undefined &&
      options.expectedMtime !== null &&
      Math.floor(existingStat.mtimeMs) !== Math.floor(options.expectedMtime)
    ) {
      throw new ClaudeMdStaleMtimeError(existingStat.mtimeMs);
    }
    // 기존 content 백업.
    const prev = await fs.readFile(target.filePath, "utf8");
    saveBackup(db, target.scopeKey, target.relPath, prev);
  }

  // 디렉터리가 없을 수 있음 — global 의 경우 ~/.claude 가 항상 있다고
  // 가정 가능하지만 team/personal 의 project root 는 늘 존재.
  await fs.mkdir(path.dirname(target.filePath), { recursive: true });
  await fs.writeFile(target.filePath, content, "utf8");
  const stat = await fs.stat(target.filePath);
  return { size: stat.size, modifiedAt: stat.mtimeMs };
}
