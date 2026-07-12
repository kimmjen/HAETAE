# HAETAE Wiki System — Onboarding

프로젝트별 대화 기록을 **자기개선 메모리 루프**로 관리하는 서브시스템. Claude Code 세션 대화를
저장하고, LLM으로 프로젝트별 위키를 합성하고, 그 위키를 각 프로젝트의 `.claude/CLAUDE.md`에
주입해 다음 세션이 히스토리를 알고 시작하게 만든다.

## 한눈에 보는 루프

```
Claude Code 세션 (~/.claude/projects/<encoded>/<uuid>.jsonl)
        │  indexer (30s tick, per-file cursor)
        ▼
[ session_messages ]  모든 메시지 verbatim 저장 (text only)
        │  materialize
        ▼
[ memories ]  compact 요약 자동 승격 (세션별 고밀도 압축본)
        │  증분 정합 합성 (claude --print)
        ▼
[ project_wiki ]  프로젝트당 단일 living 지식베이스 (망각 없음, 롤백 가능)
        │  inject (크기 상한)
        ▼
.claude/CLAUDE.md  ← 다음 세션이 이걸 읽고 부트스트랩
        │  auto-trigger (settle 감지, opt-in)
        └────────────────── 루프 반복 ──────────────────┘

[ project_wiki_history ]  덮어쓰기 직전 스냅샷 (롤백)
[ graph ]  대화의 파일 참조 → 파일↔세션 관계 시각화 (Sigma.js)
```

## 핵심 설계 결정

### 1. 증분 정합 합성 (incremental reconciling synthesis)
위키는 "최근 대화 요약"이 아니라 **누적 지식베이스**다. 매 생성마다 처음부터 다시 쓰지 않고,
기존 위키에 신규 대화만 병합한다.

- **keyset 워터마크**: `project_wiki.last_message_ts` + `last_message_uuid`. 다음 생성은
  `(ts, uuid)` 이후 메시지만 읽는다 (`loadDeltaMessages`). 동일 ts 타이도 안전, compact 요약 제외.
- **reconcile merge**: 프롬프트가 기존 위키를 source-of-truth로 두고, 신규 대화가 충돌하면
  갱신·폐기 정리한다 (단순 append 아님). 이게 "요약"과 "위키"를 가르는 지점.
- 델타가 예산(80K자)을 넘으면 가장 오래된 청크만 흡수하고 나머지는 pending → `isStale`.

### 2. 부트스트랩 prelude
첫 생성(위키 없음/reset)에만 `memories`(compact 요약)를 프롬프트 prelude로 주입해 전체 히스토리
breadth를 즉시 확보한다. 정상 상태에선 위키 자체가 장기기억이므로 재주입하지 않는다(중복·이중카운팅 방지).

### 3. CLAUDE.md 주입 + 크기 상한
위키는 `.claude/CLAUDE.md`의 마커 블록(`<!-- HAETAE:WIKI:START/END -->`)에 주입된다. CLAUDE.md는
모든 미래 세션 컨텍스트에 매번 로드되므로, 위키가 커져도 주입본은 상한(`HAETAE_WIKI_CLAUDEMD_MAX_CHARS`,
기본 8000자)을 넘지 않게 섹션 우선순위로 잘라낸다. 전체 위키는 DB/UI에만.

### 4. LLM 호출은 서브프로세스로
별도 API 키 없이 `claude --print`로 사용자 구독을 통해 호출한다.
- `cwd=/tmp` — 프로젝트 훅이 서브프로세스를 가로채는 것 방지
- `--disallowed-tools Write,Edit,Bash,computer` — 순수 텍스트 생성 (파일 쓰기 시도 차단)
- 모델 선택 가능 (Opus / Sonnet / Haiku)

### 5. 자동 트리거 (opt-in)
쿼터를 자동 소비하므로 기본 OFF. `HAETAE_WIKI_AUTO=true` 시 백그라운드 스케줄러가 5중 가드로
기존 위키만 증분 갱신: 기존 위키만 / settle 디바운스 / per-project 쿨다운 / single-flight 직렬화.

### 6. 버전 히스토리 + 롤백
`onConflictDoUpdate`가 이전 위키를 파괴적 덮어쓰기하므로, 덮어쓰기 직전 전체 상태를
`project_wiki_history`에 스냅샷한다. 롤백은 **content뿐 아니라 워터마크·messagesCovered까지 복원** —
content만 되돌리면 워터마크가 앞선 채 남아 그 사이 메시지를 영영 못 흡수하기 때문.

### 7. 그래프 토픽은 대화에서 직접
토픽 노드는 위키 헤더가 아니라 `session_messages` 본문의 **파일/코드 참조**에서 추출한다
(`extractFileTopics`). basename으로 병합, distinct-session spread 순 상위 15개. 같은 파일을 다룬
세션들을 자동으로 묶는다(Obsidian식 공유 엔티티 링크). LLM 없이 결정적, 위키 독립.

## 보안 (로컬 전용 하드닝)
서버는 127.0.0.1 바인딩이지만 그것만으론 CSRF / DNS rebinding을 못 막는다. 파일 쓰기·프로세스
spawn을 하므로 `security/local-guard.ts`가 `onRequest`에서:
- **Host**가 loopback이 아니면 403 (DNS rebinding 차단)
- **Origin**이 존재 + non-loopback이면 403 (cross-origin CSRF 차단)
- 포트 무시 → Vite 프록시·단일오리진 프로덕션 모두 통과

추가로 `/api/wiki/generate`·`/rollback`은 `projectPath`가 등록된 프로젝트 루트인지
allowlist(`isKnownProjectPath`)로 검증 (임의 경로 파일 쓰기 = path traversal 차단).

## 데이터 모델 (SQLite, Drizzle)

| 테이블 | 역할 | migration |
| --- | --- | --- |
| `session_messages` | 모든 JSONL 메시지 verbatim (uuid 유니크 dedup) | 0006 |
| `memories` | compact 요약 자동 승격 | 0007 |
| `project_wiki` | 프로젝트당 1행 living 위키 (+ 워터마크/model) | 0008–0010 |
| `project_wiki_history` | 덮어쓰기 직전 전체 상태 스냅샷 (최근 20개) | 0011 |

## 코드 맵

서버 (`apps/server/src/`)
- `services/usage/indexer.ts`, `jsonl-parser.ts` — JSONL 인덱싱, 메시지 파싱
- `services/memory/materialize.ts` — compact 요약 → memories
- `services/memory/wiki.ts` — 증분 합성/델타 선택/롤백 (`generateProjectWiki`, `loadDeltaMessages`, `selectDelta`, `buildPrompt`, `rollbackProjectWiki`)
- `services/memory/inject-wiki.ts` — CLAUDE.md 주입 + 크기 상한 (`injectWikiIntoCLAUDEMd`, `capWikiForInjection`)
- `services/memory/wiki-history.ts` — 스냅샷/조회/prune
- `services/memory/auto-wiki.ts` — 자동 스케줄러 (`startWikiAutoScheduler`, `selectAutoWikiCandidates`)
- `services/memory/graph.ts` — 그래프 (`buildProjectGraph`, `extractFileTopics`)
- `security/local-guard.ts` — Host/Origin 가드
- `routes/project-wiki.ts` — API

웹 (`apps/web/src/`)
- `components/ProjectWikiPanel.tsx` — 3-pane (목차 | 위키 | 그래프) + 이력/롤백 + 모델 선택
- `components/ProjectGraphPanel.tsx` — Sigma.js force-directed
- `hooks/useProjectWiki.ts`, `hooks/useProjectGraph.ts`

## API

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/wiki` | 전체 프로젝트 위키 목록 |
| GET | `/api/wiki/page?projectPath=` | 단일 위키 (pendingMessages/isStale 포함) |
| GET | `/api/wiki/graph?projectPath=` | 그래프 노드/엣지 (LLM 없음) |
| GET | `/api/wiki/history?projectPath=` | 버전 스냅샷 목록 |
| POST | `/api/wiki/generate` | `{projectPath, model, reset?}` 증분 생성/갱신 |
| POST | `/api/wiki/rollback` | `{projectPath, historyId}` 버전 복원 |

## 설정 (`apps/server/.env.local`)

```
# 자동 갱신 (기본 off — 쿼터 소비)
HAETAE_WIKI_AUTO=false
HAETAE_WIKI_AUTO_INTERVAL_MS=300000     # 스케줄러 틱 (5분)
HAETAE_WIKI_AUTO_DEBOUNCE_MS=600000     # settle 판정 (10분 조용)
HAETAE_WIKI_AUTO_COOLDOWN_MS=1800000    # per-project 쿨다운 (30분)

# CLAUDE.md 주입 크기 상한
HAETAE_WIKI_CLAUDEMD_MAX_CHARS=8000
```

## 작업 시 유의점
- 위키 합성/델타 선택은 순수 함수로 분리돼 있다(`selectDelta`, `buildPrompt`, `extractFileTopics`,
  `selectMemoriesPrelude`, `capWikiForInjection`, `assessLocalRequest`, `isKnownProjectPath`).
  로직 변경은 이 순수 함수 단위 테스트부터.
- `claude --print` 호출 경로(LLM/서브프로세스)는 단위 테스트하지 않는다 — 순수 로직 + 라이브 실행으로 검증.
- 롤백·증분의 정합성은 **워터마크**에 달려 있다. 워터마크를 건드리는 변경은 "content와 워터마크가
  항상 함께 이동하는가"를 먼저 확인할 것.
