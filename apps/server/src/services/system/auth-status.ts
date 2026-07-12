import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Wraps `claude auth status --json`. The CLI is HAETAE 의 유일한 source
 * of truth for subscription tier — `~/.claude/settings.json` 에는 model /
 * theme 만 있고 등급 (Pro / Max / Team) 은 안 적혀있음. 자세한 근거는
 * docs/research/claude-code-data-sources.md.
 */
export interface AuthStatus {
  loggedIn: boolean;
  authMethod: string | null;
  apiProvider: string | null;
  email: string | null;
  orgId: string | null;
  orgName: string | null;
  /** "pro" | "max" | "team" | "free" | null. CLI가 등급을 모를 때도 있음. */
  subscriptionType: string | null;
}

/**
 * `claude` 가 PATH 에 없거나 OAuth 가 만료됐거나 실패하면 loggedIn=false
 * 로 fall through. 호출자는 추가 분기 없이 \"미로그인\" UI 만 보여주면 됨.
 */
export async function readAuthStatus(): Promise<AuthStatus> {
  const empty: AuthStatus = {
    loggedIn: false,
    authMethod: null,
    apiProvider: null,
    email: null,
    orgId: null,
    orgName: null,
    subscriptionType: null,
  };
  try {
    const { stdout } = await execFileAsync("claude", ["auth", "status", "--json"], {
      timeout: 5_000,
      maxBuffer: 256 * 1024,
    });
    const parsed = JSON.parse(stdout) as Partial<AuthStatus>;
    return {
      loggedIn: parsed.loggedIn === true,
      authMethod: parsed.authMethod ?? null,
      apiProvider: parsed.apiProvider ?? null,
      email: parsed.email ?? null,
      orgId: parsed.orgId ?? null,
      orgName: parsed.orgName ?? null,
      subscriptionType: parsed.subscriptionType ?? null,
    };
  } catch {
    return empty;
  }
}
