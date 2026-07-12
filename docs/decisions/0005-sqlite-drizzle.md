# ADR 0005 — SQLite + Drizzle ORM

Status: Accepted
Date: 2026-05-02

## Context

DB 선택 + ORM 선택 한꺼번에. 사용 시나리오:
- JSONL 파싱 결과 캐시 (Phase 4)
- 마크다운 파일 백업 history (Phase 1)
- app-level state (테마, last-active project 등)

요구사항:
- 단일 사용자, 단일 머신
- 새 머신 옮길 때 setup 단순해야 함
- 미래 PostgreSQL 마이그레이션 가능성은 0.1% 라도 살리고 싶음 (저비용으로)

## Decision

**SQLite + Drizzle ORM**.

- DB 파일: `cache.db`. WAL 모드 + foreign keys on
- 위치: OS 표준 (`env-paths`) — `~/Library/Application Support/haetae/` 등
- 마이그레이션: drizzle-kit 이 SQL 생성 → 서버 부팅 시 적용
- 스키마는 ANSI SQL 위주 — PG 마이그레이션 시 connection string 만 변경하면 가까움
- 드라이버: `better-sqlite3` (네이티브, 동기 API, WAL 지원)

## Consequences

- 새 머신 setup 비용: `pnpm install` 시 native build 1회 (`pnpm-workspace.yaml` 의 `allowBuilds` 가 명시적 허용)
- PG 옵션 보존: Drizzle 의 schema 코드가 거의 동일하게 PG 에 동작
- WAL 모드로 동시 read 가능 (단일 사용자라 큰 가치는 아님, 편의성)
- SQLite 의 `STRICT` 키워드는 drizzle-kit 이 emit 안 함 — Drizzle 의 TS 타입으로 컴파일 타임 안전성 확보 (PG 도 STRICT 무관)
- `cache.db` 는 `~/.claude/` 로부터 재생성 가능 — 머신 옮길 때 동기화 불필요

## Alternatives considered

| 옵션 | 탈락 사유 |
|---|---|
| **PostgreSQL** | 단일 사용자 로컬 도구에 별도 프로세스 + 데몬 + 포트 오버헤드. 새 머신 setup 부담 ↑. 동시 쓰기 충돌도 없음 |
| 직접 SQL (better-sqlite3 만) | PG 마이그레이션 시 모든 쿼리 다시 짜야 함 |
| Prisma | Schema 마이그레이션은 강력하나 무거움 (큰 client 번들, 별도 generation step) |
| Kysely | 가벼운 query builder. Drizzle 보다 매력적이나 schema migration 도구가 약함 |
| TypeORM | NestJS 친화적이나 ADR 0003 에서 NestJS 탈락 → 매력 없음 |
| 파일 기반 (JSON / YAML) | Phase 4 의 수백 MB JSONL 캐시 처리 부담 |

## Future migration to PostgreSQL

가능성 0.1% 지만 비용 거의 0 으로 보존:
1. `pnpm --filter haetae-server add postgres` 로 드라이버 추가
2. `drizzle.config.ts` 의 `dialect` 변경
3. `apps/server/src/db/index.ts` 가 환경에 따라 분기
4. SQLite 특이 함수 (`unixepoch()`) 만 교체 — 현재 사용 1군데
