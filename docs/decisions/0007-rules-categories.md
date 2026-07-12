# ADR 0007 — Rules / Global Rules / Skills 컨셉 분리

Status: Accepted
Date: 2026-05-03

## Context

Phase 2 동안 사이드바 Guarding 섹션에 세 nav 항목 (Rules / Global Rules / Skills) 을 두면서, 각 항목이 무엇을 의미하는지 코드 레벨 정의가 비어있었다. 결과적으로:

- `/guarding/rules` 가 `~/.claude/` 의 모든 카테고리 (CLAUDE.md + rules/ + skills/ + agents/ + commands/) 를 unified 트리 하나로 보여줌 — \"Rules\" 라고 부르지만 실제로는 user-global 전체.
- \"Global Rules\" / \"Skills\" 라벨의 nav 두 개는 LockedView 로 placeholder.
- 라벨↔라우트가 엇갈림 (\"Global Rules\" → /guarding/skills, \"Skills\" → /guarding/commands).

P2.5 에서 프로젝트 scope 를 도입한 후, 세 nav 가 **각자 다른 데이터 슬라이스를 보여주는** 컨셉이라는 게 명확해졌다.

## Decision

세 nav 의 정의를 다음과 같이 박는다:

| Nav | 데이터 소스 | 콘텐츠 카테고리 |
|---|---|---|
| **Rules** | 모든 등록된 프로젝트의 `.claude/` (글로벌 제외) | CLAUDE.md + `rules/` |
| **Global Rules** | `~/.claude/` 만 | CLAUDE.md + `rules/` |
| **Skills** | `~/.claude/` + 모든 등록된 프로젝트의 `.claude/` | `skills/` |

언어적 근거:

- **Rules** 는 \"각 프로젝트에 있는 것\" — 프로젝트 단위로 흩어져 있는 규칙
- **Global Rules** 는 \"흩어진 것들을 하나로\" — 사용자가 한 곳에 모아두는 마스터 규칙 (`~/.claude/`)
- **Skills** 는 \"코드/문서 만들 때 사용\" — 콘텐츠 카테고리상 rules 와 분리되는 액션. scope 와 무관하게 통합

## Consequences

### 긍정
- 사이드바 nav 가 의미 있게 분리됨 — placeholder LockedView 0개
- 각 뷰의 데이터 슬라이스가 명확해서 컴포넌트 재사용 가능
- 라우트명이 의미와 일치 (`/guarding/global-rules`, `/guarding/skills`)

### 부정 / 비용
- claude-fs 가 카테고리 필터를 알아야 함 (`readTree(home, { category })`)
- 클라가 다중 scope aggregation 책임 — Rules / Skills 뷰는 N+1 fetch (`useQueries`)
- DiffView, RulesView 등 기존 컴포넌트 일부 재배치

### 미정
- \"agents/\" 와 \"commands/\" 는 본 ADR 에서 다루지 않는다 — 별도 결정 (Phase 4+ 에서 필요해지면 정의)
- 프로젝트별 Rules 뷰 (`/projects/$slug`) 는 현행 유지 — Rules nav 는 모든 프로젝트의 머지 형태이고, 개별 프로젝트는 그대로 슬러그 진입

## 구현 단계

- **P2.7a (server)**: claude-fs 에 `category` 필터 추가 + 라우트에 `?category=rules|skills` 파라미터
- **P2.7b (web)**: 세 뷰 + 사이드바 라벨/라우트 정렬 + 라우트 재배치

## Re-evaluation trigger

- agents / commands 카테고리 활성화 결정이 필요해질 때
- 다중 scope aggregation 의 N+1 fetch 가 실측 병목으로 드러날 때 → 서버 aggregation 엔드포인트로 이동
