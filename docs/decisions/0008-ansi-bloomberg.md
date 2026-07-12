# ADR 0008 — ANSI 16색 매핑: Bloomberg 톤

Status: Accepted
Date: 2026-05-03

## Context

Phase 3 (통합 터미널, xterm.js) 진입 시 ANSI 16색 (\\x1b[30m–\\x1b[37m, \\x1b[90m–\\x1b[97m) 을 어떤 팔레트로 매핑할지 결정 필요. \`docs/decisions/pending.md\` 의 \"ANSI 색 매핑\" 항목.

선택지:

| 옵션 | 설명 |
|---|---|
| A | UI 는 Bloomberg, 터미널 ANSI 만 단청 (한국 단청색 16종) |
| B | 둘 다 Bloomberg 변형 — 단일 팔레트 |
| C | 보류 — 터미널 가동 후 사용감으로 결정 |

## Decision

**B — 둘 다 Bloomberg 톤**.

UI 와 터미널이 같은 토큰 시스템을 공유한다. ANSI 16색은 \`--ansi-0\` ~ \`--ansi-15\` CSS 토큰으로 정의해 한 곳에서 관리하고, xterm.js 의 \`theme\` 옵션이 이 토큰을 읽어가도록 한다.

### Bloomberg 안에서의 가드레일

ANSI 의 *의미 전달용* 4색은 다른 색보다 채도를 약간 살려 둔다 — 완전히 muted 로 가면 git/lint/오류 출력이 평면화되어 터미널 가독성이 깎인다.

| ANSI | 역할 | 톤 가이드 |
|---|---|---|
| 1 (red), 9 (bright red) | error / 삭제 / 위험 | Bloomberg 안에서 채도 살린 빨강 |
| 2 (green), 10 (bright green) | success / 추가 | 채도 살린 초록 |
| 3 (yellow), 11 (bright yellow) | warning | 채도 살린 노랑 |
| 4 (blue), 12 (bright blue) | info / link | Bloomberg 의 accent 와 맞춤 |
| 0/7/8/15 (black/white 류) | bg/fg/grays | Bloomberg neutral 그대로 |
| 5/6/13/14 (magenta/cyan) | 보조 | Bloomberg neutral 변형 |

### 위치
- 토큰 정의: \`apps/web/src/index.css\` (\`@theme\` 또는 동급 위치)
- xterm.js 적용: Phase 3 의 터미널 컴포넌트에서 토큰을 읽어 \`theme\` 객체 구성

## Consequences

### 긍정
- 한 팔레트 → 시각 노이즈 ↓, 사이드바·터미널 동시 시청 시 피로 ↓
- \`--ansi-N\` 토큰 16개만 바꾸면 ANSI 전체 갱신
- 다크/라이트 모드 일관성 — \`.dark\` 스코프 override 패턴 그대로 사용
- 단청 16색 팔레트 디자인 작업 (현존하지 않음) 회피 — Phase 3 ship 속도 우선

### 부정
- 터미널이 \"표준 색감\" 과 다르게 보일 수 있음 — 익숙하지 않은 사용자에겐 적응 필요
- 일반적인 ANSI 데모/스크린샷과 비교했을 때 톤 차이가 즉시 보임

### 가역성
- ADR 은 \`Superseded\` 로 갈아치울 수 있고, 토큰만 바꾸면 모든 사용처 자동 반영
- 실사용 후 단청 또는 더 saturated 한 팔레트가 필요하다고 판단되면 ADR 0008-S 로 교체

## Alternatives considered

| 옵션 | 탈락 사유 |
|---|---|
| A — UI Bloomberg + ANSI 단청 | 단청 16색 팔레트가 표준화되어 있지 않아 디자인 작업 선행 필요 — Phase 3 ship 지연 위험 |
| C — 보류 | Phase 3 작업이 시작되면 어떻게든 색을 박아야 하는데, 미확정 상태로 들어가면 임시 hex 가 코드 곳곳에 박힐 가능성 ↑ |

## Re-evaluation trigger
- 일상 사용에서 \"색 구분이 부족해서 의미가 안 보임\" 이 반복 발생
- 단청 톤에 대한 명확한 색 가이드(예: 16색 매핑표) 가 확보됨
- 사용자가 다중 테마 (Bloomberg / 단청 / 표준 ANSI) 를 명시적으로 요구
