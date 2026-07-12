import { z } from "zod";
import { readClaudeOauth } from "./keychain";

/**
 * Claude Code 의 비공식 OAuth 한도 endpoint 를 직접 호출.
 *
 *   GET https://api.anthropic.com/api/oauth/usage
 *   Authorization: Bearer sk-ant-oat01-...
 *   anthropic-beta:  oauth-2025-04-20      ← 없으면 401
 *
 * 이 endpoint 는 \`claude /config\` 의 Usage 탭이 호출하는 것과 동일.
 * 비공개 / 비문서 API 라 schema 변경 시 무음 깨짐 — zod \`.passthrough()\`
 * 로 알 수 없는 필드는 통과시키되, 우리가 쓰는 핵심 필드만 strict 검증.
 */

const WindowSchema = z
  .object({
    utilization: z.number(),
    resets_at: z.string().nullable().optional(),
  })
  .passthrough();

export const RawSchema = z
  .object({
    five_hour: WindowSchema.nullable().optional(),
    seven_day: WindowSchema.nullable().optional(),
    seven_day_opus: WindowSchema.nullable().optional(),
    seven_day_sonnet: WindowSchema.nullable().optional(),
    extra_usage: z
      .object({
        // The live API sends these as null when extra usage is disabled, so
        // they must be nullable — z.number().optional() rejects null and would
        // fail the whole parse (→ readUsageLimits returns null → no Overview
        // progress bars).
        is_enabled: z.boolean().nullable().optional(),
        monthly_limit: z.number().nullable().optional(),
        used_credits: z.number().nullable().optional(),
        utilization: z.number().nullable().optional(),
        currency: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export interface UsageWindow {
  /** 0~100 (이미 percent 단위). */
  utilization: number;
  /** ISO timestamp; null 이면 한도 미적용. */
  resetsAt: string | null;
}

export interface UsageLimits {
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  sevenDayOpus: UsageWindow | null;
  sevenDaySonnet: UsageWindow | null;
  extra: {
    enabled: boolean;
    monthlyLimit: number;
    usedCredits: number;
    utilization: number | null;
    currency: string;
  } | null;
  /** \`Subscription type from keychain (\"pro\"/\"max\"/\"team\")\`. */
  subscriptionType: string | null;
  /** Token 만료 unix ms. UI 가 expiry warning 띄울 때 사용. */
  oauthExpiresAt: number;
}

function shape(w: z.infer<typeof WindowSchema> | null | undefined): UsageWindow | null {
  if (!w) return null;
  return {
    utilization: w.utilization,
    resetsAt: w.resets_at ?? null,
  };
}

/**
 * `null` 반환 케이스: opt-in flag 미설정, 토큰 없음 (미로그인 / non-mac),
 * 토큰 만료, fetch 실패, schema 검증 실패. UI 는 모두 동일하게 \"한도
 * 정보 없음\" fallback 으로 처리.
 *
 * **기본 비활성 (opt-in)**: 비공식 OAuth endpoint 라 명시적 동의 전엔 호출
 * 하지 않는다. `apps/server/.env.local` 에 `HAETAE_USE_OAUTH_LIMITS=true`
 * 를 추가해야 켜진다 (그 외 값·미설정은 모두 비활성).
 */
export async function readUsageLimits(): Promise<UsageLimits | null> {
  if (process.env.HAETAE_USE_OAUTH_LIMITS !== "true") return null;
  const oauth = await readClaudeOauth();
  if (!oauth || !oauth.accessToken) return null;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${oauth.accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        // CLI 와 user-agent 다르게 두는 게 정직함 — 추후 식별 추적이
        // 공식적으로 막히면 이 헤더 그대로 두고 fallback 처리.
        "User-Agent": "haetae-local-console/1.0",
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const parsed = RawSchema.safeParse(json);
  if (!parsed.success) return null;
  const r = parsed.data;

  return {
    fiveHour: shape(r.five_hour),
    sevenDay: shape(r.seven_day),
    sevenDayOpus: shape(r.seven_day_opus),
    sevenDaySonnet: shape(r.seven_day_sonnet),
    extra: r.extra_usage
      ? {
          enabled: r.extra_usage.is_enabled ?? false,
          monthlyLimit: r.extra_usage.monthly_limit ?? 0,
          usedCredits: r.extra_usage.used_credits ?? 0,
          utilization: r.extra_usage.utilization ?? null,
          currency: r.extra_usage.currency ?? "USD",
        }
      : null,
    subscriptionType: oauth.subscriptionType,
    oauthExpiresAt: oauth.expiresAt,
  };
}
