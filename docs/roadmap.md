# 로드맵

각 Phase 의 검증 기준 통과로 다음 Phase 진입을 판단.

PR 번호·머지 일정의 단일 출처는 [status.md](./status.md).

## Phase 0 — 기반

상태: **완료**

- Vite + React + TS + Tailwind v4 셋업
- 디자인 토큰 (3-tier)
- 다크/라이트 토글
- 사이드바 + 헤더 + 푸터 골격
- 모노레포 분리 (apps/web + apps/server)
- toolchain pin + bootstrap.sh
- Phase 1 deps preinstall (zod, tanstack-query, sonner)
- 루트 README

검증:
- `pnpm dev` 로 web + server 동시 실행
- 새 머신에서 `bash scripts/bootstrap.sh` 한 줄 setup
- 서버 `127.0.0.1` 만 listening

## Phase 1 — 파일 시스템 연동

상태: **완료**

| 단계 | 산출물 | 상태 |
|---|---|---|
| P1.1 | Express → Fastify 이식 (ADR 0003 확정) | Done |
| P1.1.5 | Vitest + 베이스라인 테스트 | Done |
| P1.2 | Drizzle + SQLite + OS 표준 데이터 위치 (ADR 0005) | Done |
| P1.3 | TanStack Query 셋업 + api-client | Done |
| P1.4 | TanStack Router 셋업 (ADR 0004) | Done |
| P1.5a | `services/claude-fs` 트리 read + 화이트리스트 가드 | Done |
| P1.5b | claude-fs file read/write + SQLite 백업 | Done |
| P1.6a | Live FileTree (read) | Done |
| P1.6b | Monaco editor + write 사이클 + 라우트 lazy split | Done |

검증:
- `~/.claude/CLAUDE.md` 편집·저장 정상 작동, 백업 생성
- 화이트리스트 외 경로 접근 시 거부

## Phase 2 — Guarding 완성

상태: **완료**

| 단계 | 산출물 | 상태 |
|---|---|---|
| P2.1 | RulesView 트리 substring 필터 | Done |
| P2.2 | 단축키 매니저 + Cmd+K 명령 팔레트 (cmdk) | Done |
| P2.3 | 서버 grep + 본문/frontmatter 검색 통합 | Done |
| P2.4a | server file create + 단일 폼 | Done |
| P2.4b | 3단계 위저드 (RHF + zod) | Done |
| P2.5a | 프로젝트 발견 (env) + Sidebar live | Done |
| P2.5b | scope 인식 rules + 프로젝트 RulesView | Done |
| P2.5c | Settings UI 로 path 관리 (DB 영속) | Done |
| P2.6 | diff 비교 뷰 (동일 이름 충돌 시각화) | Done |
| P2.7a | claude-fs category 필터 + 라우트 \`?category\` (결정 0007) | Done |
| P2.7b | Rules / Global Rules / Skills 세 뷰 + 사이드바 정렬 | Done |

검증:
- 글로벌 스킬 새로 만든 직후 Claude Code 가 인식
- 키보드만으로 주요 작업 수행 가능
- 프로젝트별 `.claude/` 가 존재하면 사이드바에 자동 노출되고 클릭으로 진입 가능

## Phase 3 — Working: 통합 터미널

상태: **완료** (P3.5 까지 머지). [상세 명세](./phases/phase-3-terminal.md).

| 단계 | 산출물 | 상태 |
|---|---|---|
| P3.1 | PtyManager (node-pty) + WebSocket + cwd 가드 + 5분 idle 정리 | Done |
| P3.2 | xterm.js 단일 탭 + ADR 0008 ANSI 토큰 (3-tier) | Done |
| P3.3 | 멀티 탭 + 우클릭 메뉴 | Done |
| P3.4 | VS Code 호환 단축키 + Cmd+K 충돌 처리 | Done |
| P3.5 | URL search params (cwd / autoCommand) 연동 | Done |

전제 조건 모두 확정 — ADR 0003 (Fastify Node), ADR 0008 (Bloomberg ANSI).

검증:
- 멀티 탭 정상 (탭 전환 시 세션 유지)
- 한글·이모지·색상 정상 표시
- 세션 close 시 PTY 즉시 정리

## Phase 4 — Watching: Local

상태: **완료**. [상세 명세](./phases/phase-4-tokens.md).

| 단계 | 산출물 | 상태 |
|---|---|---|
| P4.1 | `services/usage/jsonl-parser.ts` + pricing 테이블 | Done |
| P4.2 | SQLite `usage_events` + incremental indexer | Done |
| P4.3 | `routes/usage-local.ts` (5 endpoints) | Done |
| P4.4 | Recharts + 차트 컴포넌트 (영역 / 막대 / 도넛 / 히트맵) | Done |
| P4.5 | Overview · Local Usage 페이지 데이터 연결 | Done |

검증:
- 지난 30일 토큰 사용량 5초 이내 로드 (수백 MB JSONL 기준)

## Phase 5 — Watching: API

상태: **완료**. [상세 명세](./phases/phase-5-api.md).

| 단계 | 산출물 | 상태 |
|---|---|---|
| P5.1 | `services/usage-api/admin-client.ts` (fetch + zod) | Done |
| P5.2 | drizzle `usage_api_events` + 캐시 indexer | Done |
| P5.3 | `routes/usage-api.ts` (5 endpoints) | Done |
| P5.4 | `ApiCostView` 페이지 | Done |
| P5.5 | `UnifiedView` 페이지 (Local vs API 비교) | Done |

전제: 사용자가 Anthropic Organization Admin 권한 + Admin API key 발급 가능, `.env.local` 에 등록.

검증:
- Admin API 비용 데이터가 Anthropic Console 과 일치
- key 미설정 시 페이지가 graceful (Local Usage 영향 없음)

## Phase 6 — 마감

상태: **완료** (P6.3 제외). [상세 명세](./phases/phase-6-finalize.md).

| 단계 | 산출물 | 상태 |
|---|---|---|
| P6.1 | 캐시 효율 인사이트 (insights endpoint + Local Usage 패널) | Done |
| P6.2 | 히트맵 고도화 (평균 lane / productive hours / weekday toggle) | Done |
| P6.3 | (선택) Tauri 패키징 — Tauri 결정 확정 시 | Pending |

## Post-Phase 6 — UX 개선 (kept-out)

상태: **완료**. Phase 6 마감 이후 자체 사용 중 미흡하다고 느낀 5개 항목을 별도 Phase 로 잡지 않고 일괄 머지.

| 항목 | 산출물 | PR |
|---|---|---|
| B | Footer 에 Anthropic 공개 가격표 `as-of` 표시 (`/api/usage/local/pricing-info`) | #140 |
| D | Local Usage 페이지 Export 메뉴 — 전체 JSON / by-day · by-model · by-project CSV (RFC4180 escape) | #140 |
| E | API Cost 페이지 onboarding — admin-key 발급 직링크 + Pro 사용자 Local Usage 라우팅 | #140 |
| C | 비용 임계치 알림 — Settings daily / monthly USD 입력 (localStorage) + Sidebar OVER 배지 + 진입 시 1회 toast | #141 |
| A | 세션 drill-down — Recent Sessions 클릭 → jsonl 직접 파싱한 user/assistant 메시지 타임라인 (`/watching/sessions/$sessionId`) | #142 |

검증:
- 5개 모두 main 머지 + dev server 동작 확인
- 서버 221 / 웹 238 tests 통과 (+8 신규: thresholds 5, session-detail 3, export 5 — export 는 PR 시점)

## Post-Phase 6 — round 2

상태: **완료**. 자체 사용 중 발견된 데이터 소스 누락 + 터미널 영속 + 프로젝트 페이지 빈 곳 채우기. \`docs/research/claude-code-data-sources.md\` (#144) 의 결과를 근거로 6개 PR 분할 머지.

| 항목 | 산출물 | PR |
|---|---|---|
| 구독 등급 표시 | \`claude auth status --json\` 30분 캐시 → 사이드바 ACCOUNT + Profile 풀 필드 | #145 |
| 세션 메타 통합 | \`~/.claude/usage-data/session-meta/<id>.json\` → drill-down 헤더에 first prompt / git / tool 분포 | #146 |
| Rolling Windows | \`/api/usage/local/windows\` → Overview 상단 4-셀 (5h / 24h / 7d / 이번 달) | #147 |
| 터미널 탭 라벨 | cwd tooltip + active 탭 cwd 라벨 | #148 |
| 터미널 dock 화 | root layout 영속 mount, visibility:hidden 토글 → 라우트 이동해도 PTY 안 죽음 | #149 |
| 프로젝트 페이지 | 이 프로젝트 세션 50 + auto-memory 파일 목록 | #150 |

서버 221 → 231 (+10 tests). 웹 238 유지.

## Phase 7 — 통합 두뇌 뷰

상태: **완료** (P7.4 보류). [상세 명세](./phases/phase-7-unified-brain.md). 비용/사용량은
전 프로젝트 통합이 이미 끝났고, 비어 있던 지식·대화 축의 "한 화면에서 전부 보기"
(cross-project + cross-conversation)를 채움.

| 단계 | 산출물 | 상태 |
|---|---|---|
| P7.1 | 지식 통합 탐색기 — `/api/brain/index` + `/watching/knowledge` (위키·노트·개념 단일 카탈로그) | Done #322 |
| P7.2 | 대화 전체검색 — `/api/brain/search` (`session_messages` 전 프로젝트 LIKE) | Done #322 |
| P7.3 | 통합 전역 그래프 — `/api/wiki/graph/global?include=` + 레이어 토글(노트·개념) | Done #324 |
| P7.4 | (선택) 전역 Q&A 패널 | 보류 — `ask_brain`·`recall_global` MCP 중복 + browse 부적합 |

검증: P7.2 는 LIKE 1차 컷(FTS5 승격은 규모 보고 후속). P7.3 개념 표시량은 `project_links`
신선도(식별자 churn)에 따라 변동.
