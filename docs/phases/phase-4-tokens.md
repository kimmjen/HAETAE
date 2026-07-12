# Phase 4 — Watching: Local

## 컨셉

Claude Code 가 매 세션마다 `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl` 에 모든 메시지를 append-only 로 기록한다. assistant 메시지에 `usage` 객체가 붙어 있어, 이걸 파싱·집계하면 외부 API 없이 **로컬에서** 토큰 사용량과 cost 를 다 계산할 수 있다.

목표: 지난 30일의 사용량을 5초 이내에 화면에 띄운다 (수백 MB JSONL 누적 기준). incremental indexer 로 두 번째 로드부터는 새 줄만 파싱.

## 데이터 소스

```
~/.claude/projects/                                  # discoverProjects 와 별개의 Claude Code 자체 위치
├── -Users-me-Documents-GitHub-Demo/                 # cwd 의 / 를 - 로 치환
│   ├── d215693d-6b94-4e96-aced-7b312430857a.jsonl   # 한 세션 = 한 파일
│   └── ...
├── -Users-me-Documents-GitHub-Other-Project/
└── ...
```

각 줄 = 한 entry (JSON object). 주요 type:

| type | 설명 |
|---|---|
| `user` | 사용자 입력 |
| `assistant` | 모델 응답 — **여기에 usage 가 붙음** |
| `system`, `permission-mode`, `agent-name`, ... | 메타데이터 (집계 무관) |

assistant entry 의 `message.usage`:

```json
{
  "input_tokens": 3,
  "output_tokens": 34,
  "cache_creation_input_tokens": 4982,
  "cache_read_input_tokens": 11337,
  "cache_creation": { "ephemeral_5m_input_tokens": 4982 }
}
```

`message.model`: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`, ...
top-level `timestamp`: ISO-8601 (`"2026-04-05T11:41:04.490Z"`)

## 모델 가격 (per 1M tokens, USD)

| 모델 family | input | output | cache_write | cache_read |
|---|---|---|---|---|
| Opus | 15.00 | 75.00 | 18.75 | 1.50 |
| Sonnet | 3.00 | 15.00 | 3.75 | 0.30 |
| Haiku | 0.80 | 4.00 | 1.00 | 0.08 |

`services/usage/pricing.ts` 에 모델 prefix 매칭 (`claude-opus-*` → opus 등) + lookup 테이블. Anthropic 가격 변동 시 한 곳만 갱신.

## 데이터 플로우

```
[~/.claude/projects/**/*.jsonl]
       ↓ (file watch + mtime/offset)
[services/usage/jsonl-parser.ts] — 한 줄씩 stream 파싱, usage 추출
       ↓
[services/usage/indexer.ts] — incremental: file별 last_offset / mtime 기록
       ↓
[SQLite usage_events 테이블] — 집계 가능한 형태
       ↓
[routes/usage-local.ts] — 기간/모델/프로젝트 aggregation API
       ↓
[apps/web Recharts UI] — Overview / Local Usage 페이지
```

## DB 스키마

```sql
-- 한 assistant 메시지 = 한 row. 같은 파일 재파싱 시 (sessionId, messageId)
-- UNIQUE 제약으로 dedupe.
CREATE TABLE usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  project_path TEXT NOT NULL,           -- decoded cwd
  model TEXT NOT NULL,                  -- raw model id
  ts INTEGER NOT NULL,                  -- unix ms
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_creation_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,               -- 가격 테이블 기반 사전 계산
  UNIQUE(session_id, message_id)
);
CREATE INDEX usage_events_ts ON usage_events(ts);
CREATE INDEX usage_events_project ON usage_events(project_path);
CREATE INDEX usage_events_model ON usage_events(model);

-- file별 마지막 파싱 위치 — 다음 indexer 실행 시 새 줄만 처리
CREATE TABLE usage_file_cursor (
  file_path TEXT PRIMARY KEY,
  last_offset INTEGER NOT NULL,         -- byte offset
  last_mtime INTEGER NOT NULL           -- file mtime (ms)
);
```

## API 엔드포인트

| route | 용도 |
|---|---|
| `POST /api/usage/local/refresh` | indexer 강제 실행 (UI 새로고침 버튼) |
| `GET /api/usage/local/summary?days=30` | 기간별 합계 (tokens, cost) |
| `GET /api/usage/local/by-day?days=30` | 일별 영역 차트 데이터 |
| `GET /api/usage/local/by-model?days=30` | 모델별 도넛 차트 |
| `GET /api/usage/local/by-project?days=30` | 프로젝트별 막대 차트 |
| `GET /api/usage/local/heatmap?days=30` | 요일×시간 히트맵 (24×7 격자) |

응답은 항상 `{ data, meta: { generatedAt, totalEvents } }` 형태. `Cache-Control: no-store` (변경 잦음).

## UI

### Overview 페이지

- 30일 토큰 합계 + cost 한 줄 KPI (이미 모의 placeholder 있음 → live 로 교체)
- 일별 영역 차트 (input / output / cache_read 누적)
- 모델별 도넛 (opus / sonnet / haiku 비율, cost 기준)

### Local Usage 페이지

- 기간 toggle (7d / 30d / 90d)
- 일별 막대 (cost) + 최근 7일 시간대 히트맵
- 프로젝트별 막대 (top 10, cost 기준)
- 모델별 상세 표 (count, tokens, cost)

차트 라이브러리: **Recharts** (roadmap 명시). Bloomberg 톤 색상은 ADR 0008 의 ANSI 토큰 4 의미색 (red/green/yellow/blue) + 채도 낮은 muted 6색을 모델/시리즈별로 매핑.

## 보안

- `~/.claude/projects/` 외부는 절대 읽지 않음 — claude-fs guard 와 동일 패턴
- 서버는 127.0.0.1 binding 유지
- API 응답은 토큰/cost 만, raw message 본문은 절대 노출 안 함

## 단계

| 단계 | 산출물 | 검증 |
|---|---|---|
| P4.1 | `services/usage/jsonl-parser.ts` + pricing 테이블, 단위 테스트 | 샘플 JSONL 5종 → 토큰·cost 정확 |
| P4.2 | `services/usage/indexer.ts` + drizzle migration (`usage_events`, `usage_file_cursor`), incremental 재실행 시 새 줄만 | 같은 파일 재파싱 시 row 수 변화 0, 새 line 추가 시만 증가 |
| P4.3 | `routes/usage-local.ts` (5 endpoints), zod 스키마, 통합 테스트 | 30일 summary 응답 < 5초 |
| P4.4 | Recharts 설치 + `components/charts/*` (Area/Bar/Donut/Heatmap), Bloomberg 톤 매핑 | 차트 컴포넌트 단독 스토리/테스트 |
| P4.5 | Overview · Local Usage 페이지 데이터 연결, refresh 버튼, 빈 상태 | 사용자 머신에서 실제 데이터 표시 |

## 결정 (Phase 4 진행 중 확정 예정)

- 자동 indexer 실행 시점 — server boot 시 1회 + 매 N분 + UI refresh 버튼 (어느 조합?)
- 가격 테이블 갱신 정책 — Anthropic 발표 시 사용자가 ADR + PR 로 갱신 (별도 admin UI 없음)
- session 단위 drill-down 은 Phase 4 에서 안 함 — Phase 5 또는 6 이후 결정
