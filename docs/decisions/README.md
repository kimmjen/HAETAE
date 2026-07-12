# 결정 인덱스

ADR (Architecture Decision Record) 패턴. 결정 1건당 1파일. 미확정은 [pending.md](./pending.md) 에 모음.

## 확정

| # | 결정 | 상태 | 시점 |
|---|---|---|---|
| [0001](./0001-vite-over-nextjs.md) | Vite over Next.js | Accepted | 2026-05-02 |
| [0002](./0002-monorepo-split.md) | Monorepo split (apps/web + apps/server) | Accepted | 2026-05-02 |
| [0003](./0003-fastify-server.md) | Fastify (Phase 0–3, then revisit) | Accepted | 2026-05-02 |
| [0004](./0004-tanstack-router.md) | TanStack Router | Accepted | 2026-05-02 |
| [0005](./0005-sqlite-drizzle.md) | SQLite + Drizzle ORM | Accepted | 2026-05-02 |
| [0006](./0006-direct-ui.md) | Direct-authored UI components (no shadcn/ui) | Accepted | 2026-05-03 |
| [0007](./0007-rules-categories.md) | Rules / Global Rules / Skills 컨셉 분리 | Accepted | 2026-05-03 |
| [0008](./0008-ansi-bloomberg.md) | ANSI 16색 = Bloomberg 톤 단일 팔레트 | Accepted | 2026-05-03 |
| [0009](./0009-notebooklm-integration.md) | NotebookLM 통합 (RESEARCH 축) | Superseded by 0010 | 2026-06-04 |
| [0010](./0010-notebooklm-python-app.md) | NotebookLM = Python(FastAPI) 1급 앱 (멀티런타임) | Accepted | 2026-06-04 |
| [0011](./0011-second-brain-llm-wiki.md) | 세컨드 브레인 = LLM-wiki (임베딩/RAG 안 씀) | Accepted | 2026-06-09 |
| [0012](./0012-tauri-desktop.md) | 데스크톱 = Tauri (셸 + Node 사이드카) | Accepted | 2026-06-09 |

## 미확정

[pending.md](./pending.md) 참조. 시점 도달 시 확정 → 새 ADR 로 승격.

| 항목 | 옵션 | 결정 시점 |
|---|---|---|
| 폰트 | Inter / Pretendard | 자유 |
| `Cmd+K` 충돌 | 명령 팔레트 vs 터미널 출력 지우기 | Phase 2 |

(PTY 라이브러리 → node-pty 확정. Tauri → ADR 0012 로 확정.)

## 격식

각 ADR 은 다음 형식:
```
# ADR NNNN — Title

Status: Accepted | Superseded | Pending
Date: YYYY-MM-DD

## Context
(왜 결정이 필요했는지, 제약, 후보 옵션)

## Decision
(무엇을 정했는지, 한 문장)

## Consequences
(긍정/부정 영향, 후속 작업)

## Alternatives considered
(다른 옵션과 탈락 사유)
```
