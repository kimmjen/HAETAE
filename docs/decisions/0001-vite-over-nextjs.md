# ADR 0001 — Vite over Next.js

Status: Accepted
Date: 2026-05-02

## Context

초기 명세는 Next.js 15 + App Router 를 가정 (구 `Doc.md`, `Doc2.md` 일부). 그러나 Haetae 의 실제 요구사항은:
- 로컬 전용 도구 — 외부 호스팅 없음
- 추후 Tauri 데스크톱 앱화 가능성
- 무거운 로컬 FS 작업 + 네이티브 의존성 (better-sqlite3, future node-pty)
- 단일 사용자, 인증 없음

Next.js 의 SSR / RSC / Edge / ISR 가치가 본 도구에는 무의미.

## Decision

**Vite 6 + React 19 + TypeScript** 으로 셋업.

## Consequences

- 클라이언트 SPA 가 단순함 — 서버는 별도 패키지 (ADR 0002)
- Tauri 정석 조합 (Vite + React) — 미래 마이그레이션 비용 최소
- React Router 또는 TanStack Router 선택지 (ADR 0004)
- Express → Fastify 도 자유롭게 교체 가능 (ADR 0003)
- Next.js 의 file-based 라우팅 / next/font / next/image 같은 편의 기능은 잃음 (대부분 vite 플러그인 / TanStack 으로 대체)

## Alternatives considered

| 옵션 | 탈락 사유 |
|---|---|
| Next.js 15 (App Router) | 로컬 전용 도구에 SSR/RSC 무의미, Tauri 통합 어려움 |
| Remix | Next 와 비슷한 단점 |
| Nuxt / SvelteKit | React 생태계 외 |
| Astro | SPA 인터랙션 부족 |
