# ADR 0009 — NotebookLM 통합 (RESEARCH 축)

Status: Superseded by [0010](./0010-notebooklm-python-app.md)
Date: 2026-06-04

## Context

HAETAE는 Claude Code 사용량·규칙·터미널·세컨드브레인(노트/온톨로지)을 단일 로컬 콘솔에서 관리한다. 외부 지식 소스인 **NotebookLM**(소스 기반 grounded Q&A·콘텐츠 생성)은 현재 HAETAE 밖(웹/CLI)에서만 다뤄진다.

NotebookLM에는 공식 API가 없다. 유일한 프로그래밍 접근은 비공식 `notebooklm-py`(브라우저 쿠키/세션 기반, undocumented 엔드포인트)이며 다음 약점이 있다:

- **세션 취약** — 쿠키 만료·redirect로 인증이 끊길 수 있음 (워크스페이스 계정일수록 단명). 개인 계정은 비교적 안정.
- **휘발성** — 노트북·소스·생성물이 NotebookLM에만 존재. 계정/세션 문제 시 접근 불가.
- **깨질 수 있음** — Google이 내부 엔드포인트를 바꾸면 동작 중단.

이 약점이 곧 통합의 근거다: HAETAE가 NotebookLM 데이터를 **로컬에 미러·백업하고 시각화**하면, 취약한 소스를 내구성 있는 단일 콘솔 아래로 끌어온다. 이는 "모든 것을 한 콘솔에서 관리"라는 HAETAE의 목적과 일치한다.

후보 옵션:
1. WATCHING 축에 "Notebooks" 메뉴 추가 — 사용량 가시화와 결이 다름(외부 지식이지 Claude 사용량이 아님).
2. **새 RESEARCH 축** — NotebookLM(및 향후 외부 지식 소스)을 위한 독립 섹션.
3. 프로젝트별 위젯 — 노트북이 프로젝트에 1:1 매이지 않아 부자연스러움.

## Decision

**새 RESEARCH 축을 추가하고 NotebookLM을 미러·백업·시각화한다.**

- 사이드바에 GUARDING과 WORKING 사이 **RESEARCH** 섹션 신설. v1 메뉴: **Notebooks**.
- 백엔드는 기존 `services/memory/claude-cli.ts`의 **CLI 서브프로세스 + 동시성 큐** 패턴을 미러해 `services/notebooklm/cli.ts`로 `notebooklm` CLI를 감싼다.
- 노트북·소스·(선택)Q&A·생성물 메타데이터를 SQLite(Drizzle)에 미러한다 — NotebookLM 세션이 끊겨도 HAETAE에서 백업본을 조회할 수 있다.
- **안전 가드**: `delete`(노트북/소스 삭제)·`share`(공개·권한 변경) 등 파괴적·외부공개 작업은 노출하지 않는다.
- `notebooklm-py`는 코어 의존성에 넣지 않는다(비공식). 미설치/미인증 시 RESEARCH는 **graceful degrade**(안내 표시, 크래시 없음).

데이터 모델(신규 테이블):

| 테이블 | 용도 |
|---|---|
| `notebooklmNotebooks` | 노트북 미러 (notebookId, title, owner, createdAt, mirroredAt) |
| `notebooklmSources` | 소스 미러 (notebookId, sourceId, type, title, status) |
| `notebooklmQa` | (선택) 질의·인용 답변 보관 (notebookId, question, answer, citations) |
| `notebooklmContent` | (선택) 생성물 메타 (notebookId, type, ref, generatedAt) |

## Consequences

### 긍정
- NotebookLM의 휘발성·취약성을 로컬 미러로 보완 — 단일 콘솔에서 외부 지식 관리.
- RESEARCH 축이 향후 다른 외부 지식 소스(웹 리서치 등)의 자연스러운 자리.
- 기존 CLI 서브프로세스·Drizzle·서비스→라우트→훅→뷰 패턴 재사용 — 신규 개념 최소.

### 부정 / 비용
- 비공식 CLI 의존 — Google 변경 시 깨질 수 있음(가드: graceful degrade + 명확한 에러 안내).
- 인증이 로컬 환경(브라우저 쿠키 프로필)에 의존 — 헤드리스/타 머신 이식성 낮음.
- 미러는 스냅샷 — NotebookLM과 실시간 일치 아님(명시적 동기화 트리거 필요).

### 미정 / 범위 외 (후속)
- NotebookLM 내용 → HAETAE `projectNotes`/`projectOntology` **온톨로지 동기화**(세컨드브레인 layer 연결)는 후속 ADR.
- 오디오/비디오 등 무거운 콘텐츠 **생성 트리거**는 v1 제외(미러·조회·가벼운 Q&A 우선).

## 구현 단계

- **a (server)**: `services/notebooklm/cli.ts`(CLI 래퍼, 동시성 큐) + 스키마 4테이블 + 마이그레이션 + `routes/notebooklm.ts`(list/sources/ask/mirror) + 서비스 단위 테스트.
- **b (web)**: `useNotebooks` 훅 + RESEARCH 뷰(노트북·소스 목록·상태) + 사이드바 RESEARCH 섹션.

## Re-evaluation trigger

- `notebooklm-py`가 잦은 breakage를 일으켜 유지비가 가치보다 커질 때.
- 온톨로지 동기화 수요가 생겨 세컨드브레인 layer와의 통합이 필요해질 때 → 후속 ADR.
