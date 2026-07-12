import type { FastifyInstance } from "fastify";
import { readAuthStatus, type AuthStatus } from "../services/system/auth-status";
import { readUsageLimits, type UsageLimits } from "../services/system/usage-limits";

/**
 * `claude auth status --json` 호출은 child_process spawn 비용이 있어
 * 매 요청마다 돌리지 않고 30분 캐시. UI 가 새로 띄울 때 한 번씩만
 * 실행됨. \"방금 로그인했는데 안 바뀌네\" 케이스는 페이지 새로고침
 * 으로 해결 — 로컬 단일 사용자 도구라 충분.
 */
const CACHE_TTL_MS = 30 * 60 * 1000;
// usage-limits 는 5h 윈도우라 자주 갱신해야 의미 있음. 5분 캐시.
const LIMITS_CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  status: AuthStatus;
}

interface LimitsCacheEntry {
  fetchedAt: number;
  limits: UsageLimits | null;
}

let cache: CacheEntry | null = null;
let limitsCache: LimitsCacheEntry | null = null;

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/system/auth-status", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    const now = Date.now();
    if (cache === null || now - cache.fetchedAt > CACHE_TTL_MS) {
      const status = await readAuthStatus();
      cache = { fetchedAt: now, status };
    }
    return {
      data: cache.status,
      meta: {
        generatedAt: new Date(cache.fetchedAt).toISOString(),
        cacheTtlMs: CACHE_TTL_MS,
      },
    };
  });

  // 사용자가 \"방금 로그인했는데 갱신해줘\" 누를 때를 대비. UI 의 새로
  // 고침 버튼이 호출.
  app.post("/api/system/auth-status/refresh", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    const status = await readAuthStatus();
    cache = { fetchedAt: Date.now(), status };
    return {
      data: status,
      meta: { generatedAt: new Date().toISOString() },
    };
  });

  // 비공식 OAuth 한도 endpoint 의 응답을 캐싱해 노출. data 가 null 이면
  // 토큰 없음 / 만료 / 비공개 endpoint schema 변경 등의 이유로 가져오지
  // 못한 상태 — UI 가 fallback 으로 사용자 임계치만 보여주면 됨.
  app.get("/api/system/usage-limits", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    const now = Date.now();
    if (
      limitsCache === null ||
      now - limitsCache.fetchedAt > LIMITS_CACHE_TTL_MS
    ) {
      const limits = await readUsageLimits();
      limitsCache = { fetchedAt: now, limits };
    }
    return {
      data: limitsCache.limits,
      meta: {
        generatedAt: new Date(limitsCache.fetchedAt).toISOString(),
        cacheTtlMs: LIMITS_CACHE_TTL_MS,
        source: "claude-cli-private",
      },
    };
  });

  app.post("/api/system/usage-limits/refresh", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    const limits = await readUsageLimits();
    limitsCache = { fetchedAt: Date.now(), limits };
    return {
      data: limits,
      meta: {
        generatedAt: new Date().toISOString(),
        source: "claude-cli-private",
      },
    };
  });
}
