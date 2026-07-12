# 현재 상태

마지막 갱신: 2026-06-09 (Post-Phase 6 — 세컨드 브레인 축 + Tauri 데스크톱. 상세: [second-brain.md](./second-brain.md))

## 머지된 PR

| # | 제목 | 영향 |
|---|---|---|
| #4 | frontend bootstrap (Vite + React 19 + TS) | UI 골격 |
| #6 | doc rewrite (단일 Doc.md 통합) | 문서 (이후 #24 에서 폴더화) |
| #8 | monorepo split (apps/web + apps/server) | 아키텍처 |
| #10 | toolchain pin + bootstrap.sh | 새 머신 setup |
| #12 | sidebar WORKING placeholder | UI |
| #14 | Phase 1 deps preinstall (zod, tanstack-query, sonner) | 인프라 |
| #16 | root README + web README 갱신 | 문서 |
| #18 | Express → Fastify 이식 (결정 1 확정) | 서버 |
| #20 | Vitest + 베이스라인 테스트 | 테스트 인프라 |
| #22 | Drizzle + SQLite + OS 표준 데이터 위치 (결정 9 확정) | DB |
| #24 | docs/ 폴더 분할 + ADR 패턴 | 문서 |
| #26 | docs drift 정리 (roadmap PR 칼럼 제거 + 결정 확정 체크리스트) | 문서 |
| #28 | TanStack Query + api-client + useRulesList | 인프라 |
| #30 | TanStack Router 이식 (결정 4 활성화) | 라우팅 |
| #32 | claude-fs read service + 화이트리스트 가드 (P1.5a) | 서비스 |
| #34 | claude-fs file read/write + SQLite 백업 (P1.5b) | 서비스 + DB |
| #36 | Live FileTree + 파일 read 통합 (P1.6a) | UI |
| #38 | Monaco editor + write 사이클 + 라우트 lazy split (P1.6b) | UI + 패키징 |
| #40 | ADR 0006 — 직접 작성 UI 라이브러리 확정 | 결정 |
| #42 | Phase 1 self-eval cleanup (비동작 UI 비활성화 + 버전 진실화) | UI |
| #44 | RulesView 트리 substring 필터 (P2.1) | UI |
| #47 | pnpm start 단일 origin (tsx + @fastify/static) + 사이드바 배지 border 제거 | 인프라 + UI |
| #48 | Cmd+K 명령 팔레트 (cmdk) + useHotkey + Sidebar 트리거 (P2.2) | UI |
| #50 | 서버 grep + 팔레트 검색 통합 (P2.3) | 서비스 + UI |
| #52 | server file create + 단일 폼 (P2.4a) | 서비스 + UI |
| #54 | 3단계 위저드 (RHF + zod, P2.4b) | UI |
| #56 | Phase 2 self-eval cleanup — 빈 트리 액션 / 위저드 cancel / 팔레트 polish | UI + 문서 |
| #58 | window.confirm → ConfirmDialog (Bloomberg 톤, Radix Dialog 단발) | UI |
| #60 | 프로젝트 발견 (env) + Sidebar live (P2.5a) | 인프라 + UI |
| #62 | scope 인식 claude-fs + 프로젝트 RulesView (P2.5b) | 서비스 + DB + UI |
| #65 | 프로젝트 루트 CRUD + Settings UI (P2.5c) | 서비스 + DB + UI |
| #68 | scope diff view (Monaco DiffEditor, P2.6) | UI |
| #71 | Phase 2→3 self-eval cleanup | 인프라 + 테스트 |
| #73 | claude-fs category 필터 + ADR 0007 (P2.7a) | 서비스 |
| #75 | Rules / Global Rules / Skills 세 뷰 (P2.7b) | UI |
| #78 | ADR 0008 — ANSI 16색 = Bloomberg 톤 | 결정 |
| #80 | PtyManager + WebSocket 터미널 엔드포인트 (P3.1) | 서버 |
| #82 | xterm.js 터미널 + ANSI 3-tier 토큰 (P3.2) | UI |
| #83 | Terminal click/open 포커스 보장 (P3.2 follow-up) | UI |
| #84 | dev 모드 `/ws` Vite 프록시 (P3.2 follow-up) | 인프라 |
| #86 | 멀티 탭 + 우클릭 메뉴 (P3.3) | UI |
| #89 | VS Code 단축키 + Cmd+K 충돌 처리 (P3.4) | UI |
| #92 | autoCommand URL param + a11y/favicon (P3.5) | UI |
| #94 | PTY ready 후 autoCommand 발사 + 서버 ~ expand (fix) | 서버 + UI |
| #95 | 새 탭 자동 활성화 anti-pattern fix | UI |
| #96 | 단축키 브라우저 fallback Cmd+Shift+` | UI |
| #98 | Phase 3 self-eval — 진입 동선 + 친절한 에러 | UI |
| #101 | ProjectRoots Profile 노출 + dev WS noise 정리 | UI + 인프라 |
| #102 | Phase 4 명세 + roadmap 분할 | 문서 |
| #104 | JSONL parser + pricing 테이블 (P4.1) | 서비스 |
| #105 | hasSession + Continue 자동 분기 | 서비스 + UI |
| #107 | SQLite usage_events + incremental indexer (P4.2) | 서비스 + DB |
| #108 | Continue/Claude Code 두 버튼 + zod hasSession fix | UI + 서버 |
| #110 | usage-local API 5개 + boot indexer (P4.3) | 서버 |
| #112 | Recharts + 차트 컴포넌트 4종 (P4.4) | UI |
| #113 | Overview / Local Usage 페이지 live (P4.5) | UI |
| #114 | docs Phase 4 완료 반영 | 문서 |
| #116 | usage indexer lossy path 디코딩 fix | 서비스 |
| #117 | OverviewView 옛 Bloomberg 디자인 복구 | UI |
| #118 | Recent Sessions / Audit Table live | UI + 서버 |
| #119 / #120 | Trend toggle → Recharts BarChart only | UI |
| #121 | drizzle migration file-based 테스트 | 인프라 |
| #122 | Phase 5 명세 | 문서 |
| #124 | Anthropic Admin client (P5.1) | 서비스 |
| #126 | usage_api_events DB + indexer (P5.2) | 서비스 + DB |
| #128 | usage-api routes 5개 (P5.3) | 서버 |
| #129 | ApiCost / Unified 페이지 (P5.4 + P5.5) | UI |
| #130 | docs Phase 5 완료 반영 | 문서 |
| #131 | Phase 6 명세 + roadmap 분할 | 문서 |
| #133 | 캐시 효율 인사이트 (P6.1) | 서버 + UI |
| #135 | UsageHeatmap v2 — sparkline / top hours / weekday (P6.2) | UI |
| #136 | docs Phase 6 완료 반영 (P6.3 Tauri 보류) | 문서 |
| #138 | Phase 4~6 self-eval cleanup (TopHeader live · 404 · format util 중복 제거) | UI + 인프라 |
| #139 | docs Phase 1 라벨 + decisions/pending 정리 | 문서 |
| #140 | Pricing footer + Local Usage export + API onboarding (UX B+D+E) | 서버 + UI |
| #141 | 비용 임계치 알림 — daily/monthly localStorage + sidebar OVER badge (UX C) | UI |
| #142 | 세션 drill-down — jsonl 직접 파싱 + 메시지 타임라인 (UX A) | 서버 + UI |
| #143 | docs Post-Phase 6 UX 5종 반영 | 문서 |
| #144 | docs(research) Claude Code 로컬 데이터 소스 정리 | 문서 |
| #145 | 구독 등급 표시 (Profile + 사이드바 ACCOUNT) | 서버 + UI |
| #146 | 세션 drill-down 에 session-meta 통합 (first prompt / git activity) | 서버 + UI |
| #147 | Rolling Windows 패널 (5h / 24h / 7d / 이번 달) | 서버 + UI |
| #148 | 터미널 탭 cwd tooltip + active 탭 cwd 라벨 | UI |
| #149 | 터미널 dock 화 — 라우트 이동해도 PTY 살아있음 | UI |
| #150 | 프로젝트 페이지 세션 목록 + auto-memory 노출 | 서버 + UI |

## 완료된 인프라

| 영역 | 항목 |
|---|---|
| 셋업 | Vite 6 + React 19 + TS strict + Tailwind v4 |
| 셋업 | pnpm workspace (`apps/web` + `apps/server`) + `concurrently` 동시 실행 |
| 셋업 | `.tool-versions` (mise/asdf), `scripts/bootstrap.sh` |
| 서버 | Fastify 5, pino 로거, 127.0.0.1:3001 only |
| DB | SQLite + Drizzle, OS 표준 데이터 위치 (env-paths), 부팅 시 마이그레이션 |
| UI | Sidebar, TopHeader, Footer, HaetaeLogo, ThemeToggle, ProfileView |
| UI | 모의 페이지 (Overview / Rules / Settings / Profile / Locked) |
| 디자인 | 3-tier 디자인 토큰 + 다크 모드 + localStorage 영속 |
| 디자인 | Bloomberg 톤 색상 시스템, on-inverse 토큰 |
| 디자인 | a11y (focus-visible, button cursor, disabled 상태) |
| 인프라 | 포맷 유틸 (`lib/format/{tokens,currency,percent}`) |
| 인프라 | 모의 API (`/api/rules/list`) — Fastify 라우트. `/api/usage/local/*` 는 P4 에서 live 로 |
| 인프라 | TanStack Query (`QueryClient`, `apiGet`, `useRulesList`) |
| 라우팅 | TanStack Router 파일 기반, 모든 페이지 URL 매핑, 프리로드 (intent), 동적 `/projects/$slug` |
| 서비스 | `claude-fs` read tree + read/write file, gray-matter frontmatter, atomic write, mtime 충돌 검증 |
| DB | `file_backups` 테이블 — sha256 hash dedupe, 시간 역순 history |
| UI 데이터 | `useRulesList`, `useFile`, `useUpdateFile`, `FileTree`, Monaco 에디터 + 저장/되돌리기 |
| UI 패키징 | `/guarding/rules` 라우트 lazy split — Monaco 청크 (`rules.lazy-*.js`) 진입 시 로드 |
| 실행 | `pnpm dev` (5173+3001) / `pnpm start` (단일 :3001, NODE_ENV=production, web 정적 서빙) / `scripts/launch.sh` |
| 테스트 | Vitest 양 패키지, 469 케이스 통과 (server 231 + web 238) |
| 서비스 | usage 인덱서 — JSONL stream parsing, pricing (Opus/Sonnet/Haiku), incremental cursor |
| DB | `usage_events` (자연키 UNIQUE dedupe, 정수 micro-USD), `usage_file_cursor` |
| API | `/api/usage/local/{summary,by-day,by-model,by-project,heatmap}` + `/refresh` |
| UI | Recharts 4종 (Area/Bar/Donut/Heatmap, Bloomberg ANSI 톤), Overview/Local Usage live |
| 문서 | `docs/` 폴더, ADR 패턴, 결정 확정 체크리스트 |

## Phase 1 진행도

```
P1.1   Express → Fastify                Done   #18
P1.1.5 Vitest + 베이스라인               Done   #20
P1.2   Drizzle + SQLite + 데이터 위치    Done   #22
P1.3   TanStack Query 셋업              Done   #28
P1.4   TanStack Router 셋업             Done   #30
P1.5a  claude-fs read service           Done   #32
P1.5b  claude-fs write + backup         Done   #34
P1.6a  Live FileTree (read)             Done   #36
P1.6b  Monaco editor + write            Done   #38

Phase 1 완료. Phase 2 진입 전 결정 0006 (UI 라이브러리 = 직접 작성, #40) 확정.
```

## Phase 2 진행도

```
P2.1   RulesView 트리 필터              Done   #44
P2.2   단축키 매니저 + Cmd+K 명령 팔레트  Done   #48
P2.3   서버 grep + 본문/frontmatter 검색 Done   #50
P2.4a  server file create + 단일 폼      Done   #52
P2.4b  3단계 스킬 위저드 (RHF + zod)     Done   #54
P2.5a  프로젝트 발견 (env) + Sidebar live   Done
P2.5b  scope 인식 rules + 프로젝트 RulesView Done
P2.5c  Settings UI 로 path 관리 (DB 영속)   Done
P2.6   diff 비교 뷰 (Monaco DiffEditor)   Done
P2.7a  claude-fs category 필터 (ADR 0007)  Done
P2.7b  Rules/Global Rules/Skills 세 뷰     Done

Phase 2 완료. ADR 0008 로 ANSI = Bloomberg 단일 팔레트 확정.
```

## Phase 3 진행도

```
P3.1  PtyManager + WebSocket + cwd 가드 + idle 정리   Done   #80
P3.2  xterm.js 단일 탭 + ANSI 토큰 (3-tier)            Done   #82 + #83/#84 follow-up
P3.3  멀티 탭 + 우클릭 메뉴                            Done   #86
P3.4  VS Code 단축키 + Cmd+K 충돌 처리                 Done   #89
P3.5  URL search params (cwd / autoCommand) 연동        Done   #92

Phase 3 완료.
```

## Phase 4 진행도

```
P4.1  JSONL parser + pricing 테이블                     Done   #104
P4.2  SQLite usage_events + incremental indexer         Done   #107
P4.3  usage-local API 5개 + boot indexer                Done   #110
P4.4  Recharts + 차트 컴포넌트 4종                      Done   #112
P4.5  Overview / Local Usage 페이지 데이터 연결         Done   #113

Phase 4 완료.
```

## Phase 5 진행도

```
P5.1  Anthropic Admin client (fetch + zod)              Done   #124
P5.2  usage_api_events DB + indexer                      Done   #126
P5.3  usage-api routes 5 endpoints                       Done   #128
P5.4  ApiCostView 페이지                                 Done   #129
P5.5  UnifiedView 페이지 (Local vs API)                  Done   #129

Phase 5 완료. ANTHROPIC_ADMIN_KEY 미설정 시 graceful lock-state.
```

## Phase 6 진행도

```
P6.1  캐시 효율 인사이트                                 Done   #133
P6.2  히트맵 v2 (sparkline / top hours / weekday toggle) Done   #135
P6.3  (선택) Tauri 패키징                                Accepted ADR 0012 (v0/v1)

Phase 6 완료.
```

## Post-Phase 6 — 세컨드 브레인 (Second Brain)

북극성("AI를 위한 세컨드 브레인")을 향한 큰 축. PR 단위가 많아 capability로 요약
(상세 아키텍처: [second-brain.md](./second-brain.md), 결정: [ADR 0011](./decisions/0011-second-brain-llm-wiki.md)).

- **Capture**: LLM 위키(증분 정합) · 원자 노트(제텔카스텐 `[[wikilink]]`) · 타입 온톨로지 · 노트↔개념 링크 · voice 프로필.
- **자기개선 루프**: 자동 갱신 스케줄러 → cascade 재생성 → eval 자가감사 → eval→위키 자기교정 → staleness 표시 → eval 점수 추이 관측.
- **Recall**: 의미 기반 회상(임베딩 0, Karpathy 인덱스+`claude --print`) · Q&A 출처표기 · 그래프 의미 검색.
- **Persist**: `.claude/CLAUDE.md`에 위키+기억 인덱스 주입(신뢰도 표기) · 전역 voice 주입(백업) · stdio MCP recall 서버.
- **Visualize**: 옵시디언식 라이브 그래프(노트/온톨로지/통합/전역/세션).
- **Own**: 두뇌 → 옵시디언 마크다운 볼트 export(`.haetae/vault/`).
- **데스크톱**: Tauri 셸 v0/v1 (ADR 0012).

> 알려진 부채: 파생 레이어(노트/온톨로지/링크/eval) 전량 재생성(위키만 증분) — 증분화 후속.
> 남은 갭: 자기개선 루프 UI · 크로스프로젝트 단일 두뇌 · 외부 소스 흡수 · 스킬 자가생성.

## Post-Phase 6 — UX 개선 (kept-out 항목)

자체 사용 중 미흡하다고 느낀 5개 항목. 별도 Phase 로 잡지 않고 일괄 머지.

```
B. Pricing as-of footer                                   Done   #140
D. Local Usage export (CSV/JSON)                          Done   #140
E. Phase 5 onboarding (admin-key 안내 강화)               Done   #140
C. 비용 임계치 알림 (daily/monthly + OVER badge + toast)  Done   #141
A. 세션 drill-down (jsonl 직접 파싱 + 메시지 타임라인)    Done   #142
```

## Post-Phase 6 — round 2 (데이터 소스 통합 + 터미널 영속)

\"내가 무엇을 구독중인지 / 5h 잔량 / 위클리 잔량 어디에도 표시 안 됨\" + \"터미널이 라우트 이동하면 사라진다\" + \"프로젝트 페이지가 세션 / 메모리 를 안 보여준다\" 보고에서 시작.

```
구독 등급 표시 (claude auth status --json, Profile + 사이드바)         Done   #145
세션 drill-down 에 session-meta 통합 (first prompt / git activity)   Done   #146
Rolling Windows 패널 (5h / 24h / 7d / 이번 달)                       Done   #147
터미널 탭 cwd tooltip + active 탭 cwd 라벨                            Done   #148
터미널 dock 화 — root layout 영속, 라우트 이동해도 PTY 살아있음        Done   #149
프로젝트 페이지 세션 목록 + auto-memory 노출                          Done   #150
```

근거: docs/research/claude-code-data-sources.md (#144).

자세한 단계별 산출물은 [로드맵](./roadmap.md).

## Phase 7 — 통합 두뇌 뷰

상태: **완료** (P7.4 보류). 비용/사용량은 전 프로젝트 통합이 끝나 있었고, 비어 있던
지식·대화 축의 "한 화면에서 전부 보기"를 채움. [명세](./phases/phase-7-unified-brain.md),

| 항목 | 산출물 | PR |
|---|---|---|
| P7.1 | 지식 통합 탐색기 — 전 프로젝트 위키·노트·개념 단일 카탈로그 (`/api/brain/index`, `/watching/knowledge`) | #322 |
| P7.2 | 대화 전체검색 — `session_messages` 전 프로젝트 LIKE 검색 (`/api/brain/search`, Search 레이어) | #322 |
| P7.3 | 통합 전역 그래프 — 글로벌 그래프 노트·개념 레이어 토글 (`?include=`, 프로젝트별 id 네임스페이싱) | #324 |

서버 +15 tests (brain-index 4 · session-search 5 · graph overlay 6). P7.4(Q&A)는 MCP 중복·browse 부적합으로 보류.

## NotebookLM 인증 Settings

상태: **완료**. sync 실패 시 "터미널에서 알아서 재로그인" 마찰 제거.

| 항목 | 산출물 | PR |
|---|---|---|
| auth-status | `GET /py/notebooklm/auth-status` — 라이브 프로브로 ok/no_auth/expired/error + resolved login 명령 | #323 |
| Settings 섹션 | 인증 상태 배지 + 통합 터미널 autoCommand 재인증 + 동기화 | #323 |

## 미확정 결정

| 결정 | 시점 |
|---|---|
| Tauri 패키징 (P6.3) | 일상 사용 패턴 확정 후 |
| ESLint / Biome 도입 | 코드베이스 확장 시 |
| GitHub Actions CI | 외부 협업 발생 시 |
| Playwright / Cypress E2E | Tauri 결정과 묶임 |
| 빌드 산출물 영속 실행 (launchd / systemd) | 일상 사용 패턴 정립 시 |
| 가격 테이블 자동 갱신 | Anthropic 가격 변동 잦아지면 |

상세는 [pending decisions](./decisions/pending.md).
