# Phase 5 — Watching: API (Anthropic Admin)

## 컨셉

Phase 4 (Local Usage) 는 사용자 머신의 JSONL 로그만 본다 — 그래서 사용자가 직접 돌린 Claude Code 의 사용량 + cost 를 정확하게 보여주지만, **Anthropic 이 청구하는 실제 금액과 1:1 매칭은 보장 못 한다** (가격 변동, 환불, 프로모션 크레딧 등).

Phase 5 는 Anthropic Admin API 를 통해 **실제 청구 데이터** 를 가져와 두 가지를 한다:

1. **API Cost 페이지** — 청구 기준 사용량 / cost (조직 전체)
2. **Unified 페이지** — Local 추정과 API 실측을 나란히 비교, 차이가 크면 표시

## 데이터 소스

Anthropic Organization Admin API (`https://api.anthropic.com/v1/organizations/...`).

| Endpoint | 용도 |
|---|---|
| `/v1/organizations/usage_report/messages` | 토큰 사용량 (input/output/cache) |
| `/v1/organizations/cost_report` | USD 비용 (모델 / API key / 프로젝트별) |

쿼리 파라미터: `starting_at` / `ending_at` (RFC3339), `bucket_width` (`1d`, `1h` 등), `group_by` (모델 / API key / 워크스페이스), `next_page` (페이지네이션).

응답 shape 은 Anthropic 문서 기준 — 정확한 필드 이름은 P5.1 구현 시 fetch 응답으로 확정 후 명세 업데이트.

## 인증

`ANTHROPIC_ADMIN_KEY` (Organization Admin 권한). `apps/server/.env.local` 에서 로드. 빈 key 면 Phase 5 페이지는 "키 미설정" 안내로 lock — Local Usage 페이지에는 영향 없음.

```bash
# apps/server/.env.local
ANTHROPIC_ADMIN_KEY=sk-ant-admin-...
```

서버 boot 시 key 존재 여부만 검사 (값을 로그에 절대 안 찍음).

## 데이터 플로우

```
[Anthropic Admin API]
       ↓ HTTPS (server-side, key 절대 client 노출 X)
[services/usage-api/admin-client.ts]
       ↓ throttled fetch + zod 응답 검증
[SQLite usage_api_events (캐시)]
       ↓
[routes/usage-api.ts] — Local 과 동일한 패턴의 5 endpoints
       ↓
[apps/web ApiCostView / UnifiedView]
```

캐시 정책: TTL 1시간 + 사용자 refresh 버튼. 매 요청마다 Admin API 호출하면 rate limit + 비용 자체가 폭발할 수 있으므로 짧은 시간이라도 캐시.

## DB 스키마

```sql
CREATE TABLE usage_api_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  /* Anthropic 응답의 단위 시점 (보통 시간 또는 일 bucket). */
  bucket_start INTEGER NOT NULL,
  bucket_width TEXT NOT NULL,           -- '1d', '1h'
  model TEXT NOT NULL,
  workspace_id TEXT,
  api_key_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd_micro INTEGER NOT NULL DEFAULT 0,
  fetched_at INTEGER NOT NULL,          -- 서버가 받은 시각
  UNIQUE(bucket_start, bucket_width, model, workspace_id, api_key_id)
);

CREATE INDEX usage_api_bucket_idx ON usage_api_events(bucket_start);
```

UNIQUE 제약 → 같은 bucket 재요청 시 INSERT OR REPLACE 로 갱신. `fetched_at` 으로 cache age 표시.

## API 엔드포인트

| Route | 용도 |
|---|---|
| `POST /api/usage/api/refresh` | Admin API 호출 + 캐시 갱신 |
| `GET /api/usage/api/summary?days=30` | Local 의 `/summary` 와 같은 shape (호환) |
| `GET /api/usage/api/by-day?days=30` | 일별 cost / tokens |
| `GET /api/usage/api/by-model?days=30` | 모델별 |
| `GET /api/usage/api/unified?days=30` | **Local + API 합쳐 비교** (Unified 페이지 전용) |

응답 wrapper: `{ data, meta: { generatedAt, fetchedAt, totalEvents } }` — `fetchedAt` 만 추가.

## UI

### API Cost 페이지 (`/watching/api`)

- KPI 4 (cost · 30d / events · 30d / models / cache age)
- 일별 막대 (Recharts BarChart, Bloomberg 톤)
- 모델별 도넛
- Workspace / API key 별 표 (선택)
- Refresh 버튼 (cache 갱신)
- key 미설정 시: 안내 + Settings 링크

### Unified 페이지 (`/watching/unified`)

- 같은 기간에 대해 **Local 추정 vs API 실측** side-by-side
- delta 표시 (`+$X` 차이, percentage)
- 차이가 크면 (>10% 등) 경고 색

## 보안

- key 는 server-side 에만, client 응답에 절대 포함 안 함
- `Cache-Control: no-store` 응답 (key-derived 데이터)
- key 노출 방지를 위해 fetch 실패 시 응답에 raw error 메시지 안 넘기고 sanitize

## 단계

| 단계 | 산출물 | 검증 |
|---|---|---|
| P5.1 | `services/usage-api/pricing.ts` 재사용 + `admin-client.ts` (fetch + zod), 단위 테스트 (mock fetch) | sample fixture 응답 → 정확히 파싱 |
| P5.2 | drizzle migration `usage_api_events` + indexer (보관 + UNIQUE 갱신) | refresh 호출 시 row 누적, 재실행 idempotent |
| P5.3 | `routes/usage-api.ts` (5 endpoints) + LockedView 분기 (no key) | summary 응답 shape 이 Local 과 호환 |
| P5.4 | `ApiCostView` 페이지, refresh 버튼, KPI/차트 | 사용자 머신에서 Anthropic Console 과 30일 cost 비교 |
| P5.5 | `UnifiedView` 페이지 — Local vs API 비교 | delta 정확, key 없을 때도 페이지 lock-state 명확 |

## 결정 (Phase 5 진행 중 확정 예정)

- 캐시 TTL 정확한 값 (1h vs 6h)
- workspace / api_key 필터 UI 어디까지 노출
- key rotation 시 캐시 invalidate 정책 (`fetched_at` 기준 stale 표시)

## 전제

- 사용자가 Anthropic Organization Admin 권한 + Admin API key 발급 가능
- 사용자가 .env.local 에 key 등록 가능 (= 사용자 머신에 Anthropic 청구 계정 접근)
