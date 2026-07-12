/**
 * CLAUDE.md 위치 4가지:
 *
 *   global   : ~/.claude/CLAUDE.md
 *   team     : <project>/CLAUDE.md
 *   personal : <project>/CLAUDE.local.md
 *   subdir   : <project>/<sub/path>/CLAUDE.md  (재귀 탐색, 깊이 5)
 */
export type ClaudeMdType = "global" | "team" | "personal" | "subdir";

export interface ClaudeMdEntry {
  /** `global` | `team:<slug>` | `personal:<slug>` — 식별자. */
  key: string;
  type: ClaudeMdType;
  /** 절대 경로 (존재 여부 무관). */
  filePath: string;
  exists: boolean;
  /** 존재 시 frontmatter 헤더 스킵 후 첫 의미있는 한 줄. */
  preview: string | null;
  size: number;
  modifiedAt: number;
  /** team/personal 일 때만. */
  projectSlug?: string;
  /** team/personal 일 때만 — 사용자가 등록 시 입력한 표시명. UI 가
      별도 \`useProjects()\` 호출 없이 본 응답만으로 \"<프로젝트명> / CLAUDE.md\"
      형태 라벨 그릴 수 있게 함께 내려줌. */
  projectName?: string;
  /** team/personal/subdir 일 때 — 프로젝트 root 의 절대 경로. */
  projectAbsolutePath?: string;
  /** subdir 일 때만 — 프로젝트 root 기준 상대 경로 (예: \`docs/CLAUDE.md\`). */
  subPath?: string;
}
