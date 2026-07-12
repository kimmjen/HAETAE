# ADR 0003 — Fastify server (Phase 0–3, then revisit)

Status: Accepted
Date: 2026-05-02

## Context

서버 언어·프레임워크 선택. 후보:
- Node + Express / Fastify / NestJS
- Rust + Axum (또는 Tauri 흡수)
- Go + chi/echo
- Bun + Elysia (PTY 미지원으로 Phase 3 막힘)

Phase 3 의 통합 터미널 (xterm + PTY + WebSocket) 이 결정타. PTY 라이브러리 견고성에 따라 새 머신 setup 신뢰성이 갈림.

## Decision

**Phase 0~3 까지 Node + Fastify**, Phase 3 직전에 Rust 이식 여부 재검토 (Y 시나리오).

근거:
- 단기 개발 속도 가장 빠름
- `services/` 분리 잘 해두면 Rust 이식 시 비용 최소화
- `@fastify/websocket` 으로 Phase 3 WebSocket 표준 지원
- Express 보다 표준화 (라우트 검증, 로거, 플러그인)
- pino 로거 내장 — `console.log` 보다 운영 친화

## Consequences

- 단기: 빠른 진전. Phase 1~2 작업 부담 적음
- 중기: `node-pty` 빌드 취약성을 Phase 3 직전까지 노출 안 됨
- 장기: Phase 3 직전 결정 분기:
  - Node 유지 + node-pty 감수
  - Rust 로 server 이식 (`services/` 만 다시 짜고 fastify 라우트 → axum 핸들러)
- pino JSON 로그가 dev console 에 다소 verbose — 필요 시 `pino-pretty` 추가

## Alternatives considered

| 옵션 | 탈락 사유 |
|---|---|
| Express | 문제는 없으나 Fastify 가 표준화·성능 모두 우위 |
| **NestJS** | DI 컨테이너 + 데코레이터 보일러플레이트가 1인 로컬 도구 (~10 routes) 에 오버킬. Phase 5 Rust 이식 시 패턴이 가장 안 옮겨감 |
| Rust + Axum | 학습 곡선이 Phase 1~2 진전 늦춤. portable-pty 견고하나 지금 시작은 비용 ↑ |
| Go + chi | 표준 + 단일 바이너리 매력적이나 풀스택 TS 가 주는 타입 공유 못 누림 |
| Bun + Elysia | PTY 미지원 — Phase 3 막힘 |

## Re-evaluation trigger

Phase 3 진입 직전 (2026 후반 예상). 평가 기준:
- 그 시점의 `node-pty` 빌드 안정성
- 새 머신 setup 의 실패율
- Tauri 결정 (ADR pending) 과의 정합성
