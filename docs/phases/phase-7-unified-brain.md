# Phase 7 — 통합 두뇌 뷰 (Unified Brain Surface)

상태: **기획**. 본 문서는 명세이며 아직 미구현. 착수 시 단계별로 PR 분할.

## 컨셉

비용/사용량 축은 이미 전 프로젝트 통합(`/watching/overview`, `sessions`, `by-project`,
`unified`)이 끝났다. 비어 있는 건 **지식·대화 축의 "한 화면에서 전부 보기"** —
사용자가 관리하는 *모든 프로젝트의 위키·노트·온톨로지* + *모든 대화 내용*을 가로질러
**훑어보고(browse), 찾는(search)** 웹 표면.

핵심은 프로젝트 단위로만 열리던 지식 레이어를 *전역 집계*로 묶는 것. 우선순위는
"한번에 확인"(= overview/browse)에 맞춰 정렬한다 — 한 번에 하나씩 묻는 Q&A 가 아니라,
전체를 한 화면에 펼치는 탐색기·검색이 먼저.

| 이미 있는 것 (재사용) | 위치 |
|---|---|
| 전 프로젝트 세션 목록 + 메시지 타임라인 | `/api/usage/local/sessions(/:id)`, `session_messages` |
| 전 프로젝트 위키 메타 목록 | `GET /api/wiki` |
| per-project 노트·온톨로지 생성/조회 | `services/memory/notes.ts` `ontology.ts` |
| 글로벌 그래프(프로젝트 노드) | `buildGlobalGraph`, `/api/wiki/graph/global` |
| 프로젝트 목록 | `GET /api/projects` |
| cross-project 노트 의미 회상 / Q&A (MCP) | `recall_global`·`ask_brain`, `recall.ts`·`ask.ts` |

> 원칙 준수: LLM 호출은 전부 `claude-cli.ts`(동시성 세마포어) 재사용 — 새 API 키·임베딩
> 도입 금지([ADR 0011](../decisions/0011-second-brain-llm-wiki.md)). UI 는 3-tier 토큰·포맷
> 유틸·`<button>` 규칙([design-system.md](../design-system.md)) 준수.

## 단계

권장 착수 순서. "한번에 확인"에 직접 맞는 browse/search 가 먼저, 시각화가 다음,
Q&A 는 (선택) 후순위.

| 단계 | 산출물 | 검증 |
|---|---|---|
| P7.1 | 지식 통합 탐색기 — 전 프로젝트 위키·노트·온톨로지 단일 목록/필터/드릴다운 | 모든 프로젝트 노트 한 화면, 프로젝트·타입 필터, stale 배지 |
| P7.2 | 대화 전체검색 — `session_messages` 전 프로젝트 full-text 검색 + 결과 → drill-down | 키워드로 전 프로젝트 메시지 hit, 프로젝트 필터, 세션 점프 |
| P7.3 | 통합 전역 그래프 — 글로벌 그래프에 노트·개념·세션 노드 옵션 합류 | 프로젝트↔노트↔개념 cross-project 엣지 렌더, hairball 가드 유지 |
| P7.4 | (선택) 전역 Q&A 패널 — `recall_global`·`ask_brain` HTTP 래퍼 | 후순위. 사유는 아래 P7.4 참고 |

## P7.1 — 지식 통합 탐색기

### 무엇을 보여주나

프로젝트 단위로만 열리던 위키·노트·온톨로지를 **전 프로젝트 단일 목록**으로. 이게 사용자가
말한 "한번에 확인"의 핵심 — 전체 두뇌의 지식을 한 화면에 펼친다. 필터: 프로젝트, 레이어
(위키/노트/개념), stale 여부. 노트 → 노트 본문, 개념 → 온톨로지, 위키 → 프로젝트 위키 탭.

### 데이터 소스 / API (기획)

기존 per-project 서비스(`notes.ts`/`ontology.ts`/`wiki.ts`)를 `GET /api/projects` 로 순회해
집계하는 전역 인덱스 라우트. 무LLM(DB 조회만) — 가볍게.

```
GET /api/brain/index       // 전 프로젝트 지식 카탈로그
→ { data: {
      projects: [{ projectPath, label, wiki: { generatedAt, evalScore, stale },
                   noteCount, conceptCount }],
      notes:    [{ projectPath, slug, title, degree, stale }],
      concepts: [{ projectPath, slug, label, type }] },
    meta: { generatedAt } }
```

degree·evalScore 로 중요도/신뢰 정렬.

### UI

새 라우트 `/watching/knowledge` + 사이드바 WATCHING 에 항목 추가. 좌측 프로젝트/레이어 필터,
우측 카탈로그 목록(노트는 degree 정렬, 위키는 신뢰점수·stale 배지). 드릴다운은 기존 프로젝트
위키/노트 화면 재사용.

## P7.2 — 대화 전체검색

### 무엇을 보여주나

전 프로젝트 `session_messages` 를 가로지르는 키워드 full-text 검색. 현재 세션 목록은
*메타데이터만*(토큰/비용/모델) — 대화 내용 안은 못 들어간다. hit → 매칭 메시지 스니펫 +
세션·프로젝트·시각 → 클릭 시 `/watching/sessions/$sessionId` 드릴다운으로 점프.

### 데이터 소스 / API (기획)

`session_messages` 위에 SQLite FTS5 가상 테이블(또는 1차 컷은 `LIKE`) 인덱스. 새 라우트:

```
GET /api/sessions/search?q=&projectPath=&days=&limit=
→ { data: [{ sessionId, projectPath, role, ts, snippet, rank }],
    meta: { total, mode: "fts5"|"like" } }
```

> 결정 필요: FTS5 가상 테이블을 마이그레이션으로 추가할지(증분 인덱싱 훅 필요) vs 1차는
> `LIKE` 로 시작하고 규모 보고 FTS5 승격. 메시지 인덱서(`session_messages` 적재 경로)에
> FTS 동기화 훅을 끼우는 비용이 관건.

### UI

`/watching/knowledge` 안의 별도 탭 또는 `/watching/sessions` 상단 검색바 승격 중 택1(결정).
결과 리스트 → 기존 세션 drill-down 재사용.

## P7.3 — 통합 전역 그래프

### 무엇을 보여주나

현재 글로벌 그래프는 *프로젝트 노드만*(공유 distinctive 파일 엣지). 여기에 노트·개념·세션
노드를 옵션으로 합류시켜 **프로젝트↔노트↔개념을 cross-project 로 잇는 하나의 두뇌 그래프**.

### 데이터 소스 / API (기획)

`buildGlobalGraph` 에 `include` 파라미터 추가:

```
GET /api/wiki/graph/global?include=notes,concepts
→ 기존 프로젝트 노드 + per-project 노트/개념 노드 + 소속(project→note) ·
   노트↔개념 mention 엣지(프로젝트 내부 그래프의 mention 로직 재사용)
```

### UI

기존 `GraphView` 재사용 — 레이어 토글(프로젝트만 / +노트 / +개념). hairball 방지: 노드 수
상한 + degree 컷 + 기존 mutual k-NN/document-frequency 가드 유지(메모리
`feedback_graph_obsidian_style` — 살아있는 force 시뮬레이션·드래그·줌 라벨).

## P7.4 — (선택) 전역 Q&A 패널

후순위/선택. **권장 안 함** — 두 이유로 비용 대비 가치가 낮다:

1. **IDE 중복**: `ask_brain`·`recall_global` 은 이미 MCP 툴이라 Claude Code 세션에서 바로
   물을 수 있다. 웹에 Q&A 박스를 또 만드는 건 중복.
2. **"한번에 확인"이 아님**: Q&A 는 한 번에 하나씩 묻는 pull 방식 — 전체를 한 화면에 펼치는
   browse/overview(= 사용자 요청의 핵심)와 정반대.

그래도 필요해지면(예: 코딩 세션 없이 콘솔에서 바로 묻기) HTTP 래퍼는 얇다:

```
POST /api/brain/ask    { question, projectPath?, model? }
POST /api/brain/recall { query, model? }          // 전 프로젝트
```

응답은 기존 `data`/`meta` 봉투 + 인용 출처(session/note/wiki) 클릭 이동.

## 결정 (착수 시 확정)

- **P7.2 검색 백엔드**: FTS5 가상 테이블(증분 동기화 훅 필요) vs `LIKE` 1차 후 승격.
- **표면 통합 vs 분리**: P7.1~7.2 를 단일 `/watching/knowledge` 탭 묶음으로 vs 라우트 분리.
- **Q&A(P7.4) 채택 여부**: 위 중복·부적합 사유로 기본 보류, 실사용 요청 시 재검토.

## 검증 (Phase 전체)

- 모든 프로젝트 노트가 한 화면에 신뢰/stale 표기와 함께 노출(P7.1).
- 전 프로젝트 대화에서 키워드 검색 → 정확한 세션으로 점프(P7.2).
- `pnpm lint && pnpm test && pnpm build` 그린, 다크/라이트 패리티, 키보드 내비, raw-color
  grep 클린, 서버 `127.0.0.1` 바인딩([workflow.md](../workflow.md)).
