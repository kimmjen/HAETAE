# ADR 0006 — Direct-authored UI components (no shadcn/ui)

Status: Accepted
Date: 2026-05-03

## Context

Phase 0~1 동안 모든 UI 컴포넌트를 Bloomberg 톤 디자인 토큰 위에 직접 작성. 현존 컴포넌트:

- Sidebar, TopHeader, Footer, HaetaeLogo, ThemeToggle
- FileTree, MarkdownEditor (Monaco 래퍼)
- OverviewView, RulesView, SettingsView, ProfileView, LockedView
- 3-tier 토큰 (primitive → semantic → component) + `.dark` 스코프 override

Phase 2 직전, shadcn/ui 도입 여부 결정 필요. 이 결정은 명령 팔레트 (`cmdk`), Dialog, Toast 같은 후속 작업에 영향.

## Decision

**직접 작성 유지**. shadcn/ui 안 도입.

## Consequences

### 긍정
- Bloomberg 톤 정밀 제어 — 단일 진실 공급원 (`apps/web/src/index.css`) 만 보면 됨
- 의존성 트리 가벼움 — Radix UI 셋(Dialog/Tooltip/Dropdown 등) 미도입
- 컴파일/번들 비용 ↓
- 학습 곡선: 현존 컴포넌트와 동일 패턴 반복

### 부정
- Dialog, Tooltip, Popover, Combobox 등 표준 컴포넌트는 직접 만들거나 단발 라이브러리 도입 필요
- a11y (focus trap, escape, screen reader) 직접 챙겨야 함
- 컴포넌트 수가 많아지면 유지보수 부담 ↑

### 후속 작업 가이드
- 단발 라이브러리 도입 OK (전체 스타일 시스템 도입은 X). 예: sonner (이미), cmdk (명령 팔레트), react-hotkeys-hook (단축키)
- Headless UI 라이브러리 (radix-ui 개별 패키지, react-aria) 는 케이스별 검토 — 현 시점은 **금지하지 않지만 적극 권장도 안 함**
- 새 컴포넌트는 `apps/web/src/components/` 에, 디자인 토큰만 사용

## Alternatives considered

| 옵션 | 평가 |
|---|---|
| **shadcn/ui** 도입 | 모든 컴포넌트 테마 재작성 필요. 기존 직접 작성 컴포넌트 폐기 또는 병행 운영. 비용 > 효과 |
| Material UI / Chakra | 디자인 충돌. Bloomberg 톤 미달성 |
| Radix UI (low-level only) | 필요 시점에 단발 도입 가능 — 옵션 열어둠 |
| Headless UI by Tailwind Labs | 동일 — 단발 도입 가능 |

## Re-evaluation trigger

- 컴포넌트 수가 급증하여 직접 유지보수가 비용 우위를 상실할 때
- 사용자 (= 본인) 가 a11y / 키보드 인터랙션 요구를 직접 구현하기 부담스러워졌을 때
- shadcn/ui 가 테마 커스터마이징 비용을 획기적으로 낮추는 변화가 생겼을 때 (예: 공식 디자인 토큰 export)
