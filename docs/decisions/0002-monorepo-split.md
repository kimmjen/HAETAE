# ADR 0002 — Monorepo split (apps/web + apps/server)

Status: Accepted
Date: 2026-05-02

## Context

초기 부트스트랩은 단일 `frontend/` 폴더에 Express + Vite middleware 단일 프로세스. Phase 1 부터 실제 FS 접근, Phase 3 의 PTY/WebSocket 가 들어오면서 다음 문제:
- 클라이언트 번들에 서버 비밀 (Admin API Key) 또는 native module (better-sqlite3, node-pty) 유출 위험
- 서버 언어 교체 옵션 (ADR 0003 의 Phase 3 재검토 시) 행사 어려움
- WebSocket + PTY 의 lifecycle 을 Vite middleware 와 섞기 부담

## Decision

`apps/web` (Vite + React) + `apps/server` (Fastify) **pnpm workspace** 로 분리.
- `concurrently` 로 `pnpm dev` 한 번에 web (5173) + server (3001) 동시 기동
- web 의 `/api/*` 는 Vite proxy 로 server 전달
- 비즈니스 로직은 `apps/server/src/services/` 에 집약 — 언어 교체 시 services 만 다시 짜면 됨

## Consequences

- 클라이언트 번들에 서버 코드 못 들어옴 (물리적 분리)
- 서버 환경변수 (`ANTHROPIC_ADMIN_KEY` 등) 가 web 번들과 격리
- 네이티브 모듈은 server 에만 — Vite 빌드가 안 만남
- 두 프로세스 분리 실행으로 PTY / WebSocket 자유도 ↑
- 보일러플레이트: 루트 `package.json`, `pnpm-workspace.yaml`, `concurrently` — 작음
- `packages/shared` 공유 타입은 필요 시점에 추가 (현재 미도입)

## Alternatives considered

| 옵션 | 탈락 사유 |
|---|---|
| 단일 폴더 유지 | 위 이슈 해결 불가 |
| `frontend/server/` 같은 하위 분리만 | 같은 빌드 컨텍스트 → 클라이언트 번들 유출 위험 그대로 |
| Tauri 시작부터 (server 없음) | ADR 0003 / Phase 5 결정과 묶임 — 학습 비용 큼, Phase 1~2 늦어짐 |
