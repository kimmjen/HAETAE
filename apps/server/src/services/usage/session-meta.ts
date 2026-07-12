import fs from "node:fs/promises";
import path from "node:path";
import { getClaudeHome } from "../claude-fs/path";

/**
 * Claude Code 가 직접 집계해서 `~/.claude/usage-data/session-meta/<id>.json`
 * 에 떨어뜨리는 세션 별 메타데이터. jsonl 파싱으로는 못 뽑던
 * \"첫 프롬프트 / 실제 대화 시간 / git commit 수\" 등이 이미 들어있음.
 *
 * 디테일 근거: docs/research/claude-code-data-sources.md.
 */
export interface SessionMeta {
  sessionId: string;
  projectPath: string | null;
  startTime: number | null;
  /** 세션이 살아있던 분 (idle 포함). user_response_times 평균과는 다름. */
  durationMinutes: number;
  userMessageCount: number;
  assistantMessageCount: number;
  /** Top-tool name → count. 가장 많이 쓴 도구 표시용. */
  toolCounts: Record<string, number>;
  firstPrompt: string | null;
  userInterruptions: number;
  toolErrors: number;
  gitCommits: number;
  gitPushes: number;
  linesAdded: number;
  linesRemoved: number;
  filesModified: number;
  usesTaskAgent: boolean;
  usesMcp: boolean;
  usesWebSearch: boolean;
  usesWebFetch: boolean;
}

interface RawMeta {
  session_id?: string;
  project_path?: string;
  start_time?: string;
  duration_minutes?: number;
  user_message_count?: number;
  assistant_message_count?: number;
  tool_counts?: Record<string, number>;
  first_prompt?: string;
  user_interruptions?: number;
  tool_errors?: number;
  git_commits?: number;
  git_pushes?: number;
  lines_added?: number;
  lines_removed?: number;
  files_modified?: number;
  uses_task_agent?: boolean;
  uses_mcp?: boolean;
  uses_web_search?: boolean;
  uses_web_fetch?: boolean;
}

function toInt(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

function toBool(v: unknown): boolean {
  return v === true;
}

/**
 * `null` 이면 메타 파일이 없거나 파싱 실패. 호출자는 이걸 가지고 있을
 * 때만 풍부한 헤더를 그리고, 없으면 jsonl 기반 totals 만 그린다.
 */
export async function readSessionMeta(
  sessionId: string,
): Promise<SessionMeta | null> {
  const filePath = path.join(
    getClaudeHome(),
    "usage-data",
    "session-meta",
    `${sessionId}.json`,
  );
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  let parsed: RawMeta;
  try {
    parsed = JSON.parse(raw) as RawMeta;
  } catch {
    return null;
  }

  const startMs = parsed.start_time ? Date.parse(parsed.start_time) : NaN;

  return {
    sessionId: parsed.session_id ?? sessionId,
    projectPath: parsed.project_path ?? null,
    startTime: Number.isFinite(startMs) ? startMs : null,
    durationMinutes: toInt(parsed.duration_minutes),
    userMessageCount: toInt(parsed.user_message_count),
    assistantMessageCount: toInt(parsed.assistant_message_count),
    toolCounts:
      parsed.tool_counts && typeof parsed.tool_counts === "object"
        ? Object.fromEntries(
            Object.entries(parsed.tool_counts).map(([k, v]) => [k, toInt(v)]),
          )
        : {},
    firstPrompt: parsed.first_prompt ?? null,
    userInterruptions: toInt(parsed.user_interruptions),
    toolErrors: toInt(parsed.tool_errors),
    gitCommits: toInt(parsed.git_commits),
    gitPushes: toInt(parsed.git_pushes),
    linesAdded: toInt(parsed.lines_added),
    linesRemoved: toInt(parsed.lines_removed),
    filesModified: toInt(parsed.files_modified),
    usesTaskAgent: toBool(parsed.uses_task_agent),
    usesMcp: toBool(parsed.uses_mcp),
    usesWebSearch: toBool(parsed.uses_web_search),
    usesWebFetch: toBool(parsed.uses_web_fetch),
  };
}
