import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Claude Code 의 OAuth 자격증명을 platform 별 저장소에서 꺼내 반환.
 *
 * - **macOS** (`darwin`): 시스템 Keychain 의 \`Claude Code-credentials\` 항목을
 *   \`security\` CLI 로 읽음 (OS 기본 도구라 추가 dependency 없음).
 * - **Linux / Windows**: Claude Code 는 \`~/.claude/.credentials.json\`
 *   (\`$CLAUDE_CONFIG_DIR\` 가 있으면 그 아래) 평문 파일(mode 0600)에 저장 —
 *   secret-tool / Credential Manager 가 아님. 같은 \`claudeAiOauth\` JSON 이라
 *   동일 파서로 처리.
 *
 * 어느 경로든 실패(미설치 / 미로그인 / 파일 없음 / 파싱 실패)하면 null —
 * 호출부는 \"한도 정보 없음\" fallback 으로 처리한다.
 *
 * 근거: docs/research/claude-code-data-sources.md, docs/portability.md.
 */
export interface ClaudeOauth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  subscriptionType: string | null;
  rateLimitTier: string | null;
}

/**
 * 두 저장소가 공유하는 \`{"claudeAiOauth":{...}}\` 블록을 파싱.
 * accessToken 이 없으면(또는 JSON 이 아니면) null.
 */
export function parseClaudeOauth(raw: string): ClaudeOauth | null {
  let parsed: {
    claudeAiOauth?: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
      scopes?: string[];
      subscriptionType?: string;
      rateLimitTier?: string;
    };
  };
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  // JSON.parse also succeeds on scalars ('null', '42', '"x"') — guard before
  // property access so a degenerate credentials file falls back instead of throwing.
  if (typeof parsed !== "object" || parsed === null) return null;
  const o = parsed.claudeAiOauth;
  if (!o || typeof o.accessToken !== "string") return null;
  return {
    accessToken: o.accessToken,
    refreshToken: typeof o.refreshToken === "string" ? o.refreshToken : "",
    expiresAt: typeof o.expiresAt === "number" ? o.expiresAt : 0,
    scopes: Array.isArray(o.scopes) ? o.scopes : [],
    subscriptionType: o.subscriptionType ?? null,
    rateLimitTier: o.rateLimitTier ?? null,
  };
}

/** macOS Keychain 에서 자격증명 JSON 문자열을 꺼냄. 실패 시 null. */
async function readMacKeychain(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { timeout: 3_000, maxBuffer: 64 * 1024 },
    );
    return stdout;
  } catch {
    return null;
  }
}

/** Linux/Windows 의 \`~/.claude/.credentials.json\` (또는 \`$CLAUDE_CONFIG_DIR\`)
 *  내용을 읽음. 없으면 null. */
async function readCredentialsFile(): Promise<string | null> {
  const dir = process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude");
  try {
    return await readFile(join(dir, ".credentials.json"), "utf8");
  } catch {
    return null;
  }
}

export async function readClaudeOauth(): Promise<ClaudeOauth | null> {
  const raw =
    process.platform === "darwin"
      ? await readMacKeychain()
      : await readCredentialsFile();
  return raw ? parseClaudeOauth(raw) : null;
}
