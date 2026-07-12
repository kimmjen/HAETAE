# Haetae Web

Vite + React 19 + TypeScript + Tailwind v4. 로컬 전용 콘솔의 UI 레이어. 모든 데이터는 `apps/server` 에서 fetch — 이 패키지에는 서버 비밀이나 native module 이 없어야 함.

## Develop

저장소 루트에서:

```bash
pnpm dev
```

이 패키지만:

```bash
pnpm --filter haetae-web dev
```

서버 (`apps/server`) 가 함께 떠 있어야 `/api/*` 가 동작합니다. Vite 가 `/api/*` 를 `http://127.0.0.1:3001` 로 프록시.

기본 포트: `http://127.0.0.1:5173`

## 환경변수

`apps/web/.env.local` 에는 `VITE_*` prefix 변수만. 이 prefix 가 붙은 변수는 클라이언트 번들에 포함되므로 비밀 절대 금지.

서버 전용 비밀 (`ANTHROPIC_ADMIN_KEY` 등) 은 `apps/server/.env.local` 에.

## Build

```bash
pnpm --filter haetae-web build       # → apps/web/dist
pnpm --filter haetae-web preview     # 빌드 산출물 로컬 확인
```

상세는 [`docs/`](../../docs/README.md).
