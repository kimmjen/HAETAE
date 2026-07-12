# 디자인 시스템

## 컨셉

**Bloomberg 톤 + 광화문 해태**. Linear/Vercel 의 미니멀리즘 위에 Bloomberg 터미널의 정보 밀도. 화려하지 않되 정체성이 있고, 매일 봐도 질리지 않게.

## 원칙

| # | 원칙 |
|---|---|
| 1 | 분별이 곧 디자인 — 정보의 위계를 명확히 |
| 2 | 정보 밀도 우선 — 의미 있는 데이터 충분히, 과한 여백 회피 |
| 3 | 모노스페이스 적절 활용 — 파일 경로 / 토큰 수 / 해시 |
| 4 | 다크 모드 우선 — 라이트도 지원하되 다크 기본 |
| 5 | 즉각적 피드백 — 모든 액션에 토스트 |
| 6 | 이모지·CSS 그라데이션 절대 금지 |

## 3-tier 디자인 토큰

위치: `apps/web/src/index.css`

### Primitive — 원시 값
- `--bb-blue`, `--bb-red`, `--bb-amber`, `--bb-green`
- `--hanji-{0,50,100,200,300,500,700,900}`
- `--night-{0,50,100,200,300,400,500,700,800,900}`
- `--night-accent`, `--night-accent-hover`, `--night-danger`, `--night-warning`

### Semantic — 컴포넌트가 직접 참조
- `--app-bg-{primary,secondary,elevated,inverse,zebra,hover}`
- `--app-text-{main,muted,subtle,on-inverse,on-accent}`
- `--app-border-{main,subtle}`
- `--app-{accent,accent-hover,danger,warning,success}`
- `--app-{accent,warning,success}-on-inverse` (inverse 표면 위 강조색)
- `.dark` 스코프에서 위 변수 전부 override

### Component — 사이즈/스페이싱
- `--header-height`, `--footer-height`, `--sidebar-width`
- `--button-height-{sm,md}`
- `--card-padding-{sm,md}`

### `@theme` 브리지

Tailwind v4 가 위 semantic 변수를 utilities (`bg-bg-primary`, `text-text-muted`) 로 자동 변환.

## 컴포넌트화 규칙

- 페이지 인라인 JSX 금지. 의미 단위 또는 반복 단위는 무조건 별도 컴포넌트로 분리
- View 단위는 `src/views/`, 재사용 단위는 `src/components/`
- 인터랙티브 요소는 반드시 `<button>` (clickable `<div>` 금지) — 키보드 포커스 보장
- `disabled` 상태는 `aria-disabled` + `cursor-not-allowed` + `text-text-subtle`

## 포맷 유틸

토큰 수 / 시간 / USD / 바이트 등 모든 단위 표기는 `src/lib/format/` 거쳐서 사용. 컴포넌트 내 `Intl.NumberFormat` 직접 호출 금지.

현재 함수:
- `formatTokens(n)` — `1,234,567`
- `formatTokensCompact(n)` — `14.2k`, `1.2m`
- `formatUsd(n)` — `$14.22`
- `formatPercent(ratio)` — `4.2%`

## ANSI 색 (Phase 3)

xterm.js 가 요구하는 ANSI 16색 + 터미널 표면색은 Phase 3 직전 결정. 옵션:
- A: UI Bloomberg + ANSI 단청 (의미 분리, VS Code 패턴)
- B: 둘 다 Bloomberg 변형 (일관성, 작업량 ↑)

[Phase 3 명세](./phases/phase-3-terminal.md) 참조.

## 절대 금지

- raw 색상 클래스 (`bg-black`, `text-gray-500`, `bg-[#fff]`) — semantic 토큰만
- 임의값 색상 (`text-[#abc123]`)
- 이모지 (UI / 문서 / 커밋 / 코드 어디에도)
- CSS gradient
