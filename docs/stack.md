# 기술 스택

## 확정

### 프론트엔드 (`apps/web`)

| 영역 | 라이브러리 |
|---|---|
| 빌드 | Vite 6 + `@vitejs/plugin-react` |
| 언어 | React 19 + TypeScript (strict) |
| 스타일 | Tailwind CSS v4 (`@tailwindcss/vite`) |
| 디자인 시스템 | 직접 작성 (Bloomberg 톤 유지 — shadcn/ui 미도입, [ADR 0006](./decisions/0006-direct-ui.md)) |
| 상태 (전역) | Zustand (Phase 1 부터 사용) |
| 마크다운 | react-markdown |
| 차트 | Recharts |
| 검색 | fuse.js |
| 아이콘 | lucide-react |
| 모션 | motion |
| 유틸 | clsx + tailwind-merge, date-fns |
| 폰트 | Inter, JetBrains Mono (Pretendard 전환 검토 중) |
| 데이터 페칭 | TanStack Query (Phase 1.3 에 셋업) |
| 라우팅 | TanStack Router (파일 기반, `validateSearch` zod) |
| 에디터 | `@monaco-editor/react` + `monaco-editor` (로컬 번들, CDN 미사용) |
| 폼 | react-hook-form + `@hookform/resolvers` (zod 통합) |
| 검증 | `zod` (대부분 v4) + `zod/v3` (스킬 위저드만 — RHF resolver 5.2 가 zod 4 와 미세 충돌, zod 4 패키지가 v3 도 함께 export) |
| 토스트 | sonner (mount in `main.tsx`) |

### 백엔드 (`apps/server`)

| 영역 | 라이브러리 |
|---|---|
| 런타임 | Node.js 22.13 + TypeScript |
| 프레임워크 | Fastify 5 |
| 로거 | pino (Fastify 내장) |
| ORM | Drizzle |
| DB | SQLite (`better-sqlite3`) — WAL + foreign keys |
| 사용자 데이터 위치 | env-paths (OS 표준) |
| 검증 | zod |

### 개발 환경

| 영역 | 도구 |
|---|---|
| 워크스페이스 | pnpm workspaces |
| 실행 모델 | `concurrently` 로 web (5173) + server (3001) 동시 |
| 버전 관리 | mise/asdf 호환 `.tool-versions` |
| 부트스트랩 | `scripts/bootstrap.sh` |
| 테스트 | Vitest, @testing-library/react, happy-dom |
| 린트 | `tsc --noEmit` (ESLint 미도입) |

## 미확정

| 항목 | 옵션 | 결정 시점 |
|---|---|---|
| ANSI 색 매핑 | UI Bloomberg + ANSI 단청 / 둘 다 Bloomberg | Phase 3 직전 |
| PTY 라이브러리 | node-pty / portable-pty / creack/pty | Phase 3 직전 (서버 언어 따라) |
| 폰트 | Inter / Pretendard | 자유 |
| 단축키 충돌 (`Cmd+K`) | 명령 팔레트 vs 터미널 출력 지우기 | Phase 2 명령 팔레트 도입 시 |

확정: Tauri → 셸 + Node 사이드카 (ADR 0012). PTY → node-pty. 서버 언어 → Node 유지(+NotebookLM은 Python, ADR 0010).

상세 비교와 결정 근거는 [decisions/](./decisions/README.md).
