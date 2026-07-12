# ADR 0004 — TanStack Router

Status: Accepted
Date: 2026-05-02

## Context

라우팅 라이브러리 선택. 후보:
- **TanStack Router** — 파일 기반, 컴파일 타임 타입 안전, TanStack Query 와 1급 통합
- **React Router v7** — 안정·익숙·큰 생태계, 타입 안전성 약함
- 현재 useState 기반 페이지 state — URL 라우팅 불가, 새로고침 시 상태 소실

Haetae 의 라우팅 요구사항:
- 페이지 < 10개 (대부분 정적 path)
- URL 에 데이터 실어야 함 (예: `?cwd=...&autoCommand=...` 터미널 시작용)
- TanStack Query 를 이미 도입 (#14)

## Decision

**TanStack Router**.

결정타: TanStack Query 와의 페어가 1급 시민. Loader API 가 query client 를 직접 받음:
```ts
export const Route = createFileRoute('/watching/local')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(localUsageQueryOptions()),
  component: LocalUsagePage,
});
```

## Consequences

- URL params / search params 의 타입을 컴파일 타임에 보장 — 터미널 페이지의 `cwd`, `autoCommand` 같은 곳에서 큰 가치
- TanStack Query 와 자연스러운 데이터 fetching 패턴
- 학습 곡선 1~2일 — 페이지 < 10개라 실수 여지 적음
- 번들 크기 RR v7 대비 약 9kb gzip 작음

## Alternatives considered

| 옵션 | 탈락 사유 |
|---|---|
| React Router v7 | TanStack Query 통합 수동 작성 필요. URL 타입 안전 약함 |
| useState 유지 | URL 라우팅 불가 — 새로고침 / 깊은 링크 / 단축키 라우팅 모두 불가 |
| Next.js 스타일 | ADR 0001 에서 Next.js 자체 탈락 |
