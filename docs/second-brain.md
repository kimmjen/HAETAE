# 세컨드 브레인 (Second Brain)

HAETAE의 북극성: **"AI를 위한 세컨드 브레인"**. Claude Code 대화를 영구 지식으로
정제하고, 스스로 신선·정확하게 유지하며, 다음 세션의 AI가 *맥락 재설명 없이* 그
지식을 갖고 시작하게 한다. 단순 저장이 아니라 **기억을 가진 AI**.

서비스는 전부 `apps/server/src/services/memory/`. LLM 호출은 `claude --print`
(`claude-cli.ts`, `MAX_CONCURRENT` 큐). API는 `routes/project-wiki.ts`·`routes/voice.ts`.

## 파이프라인 (5축)

```
대화(JSONL) → [Capture] → [Maintain/self-improve] → [Recall] → [Persist] → [Visualize]
```

| 축 | 무엇 | 핵심 파일 |
|---|---|---|
| **Capture** | 위키(증분 정합) · 원자 노트(제텔카스텐) · 타입 온톨로지 · 노트↔개념 링크 · compact memories · voice 프로필 | `wiki.ts` `notes.ts` `ontology.ts` `links.ts` `materialize.ts` `voice.ts` |
| **Maintain** | 자동 갱신 스케줄러 → 파생물 cascade 재생성 → eval 자가감사 → eval→위키 자기교정 → staleness 표시 | `auto-wiki.ts` `cascade.ts` `eval.ts` `staleness.ts` |
| **Recall** | 의미 기반 회상(질문→관련 노트), Q&A(출처표기), 그래프 의미 검색, **cross-project 전역 회상** | `recall.ts` `ask.ts` `recall-global.ts` |
| **Persist** | `.claude/CLAUDE.md`에 위키+기억 인덱스 주입(신뢰도 표기) · 전역 `~/.claude/CLAUDE.md`에 voice · MCP recall 툴 | `inject-wiki.ts` `voice.ts` `mcp/` |
| **Visualize** | 옵시디언식 라이브 그래프(노트/온톨로지/통합/전역/세션) | `graph.ts`, web `GraphCanvas.tsx` |
| **Own** | 두뇌를 마크다운 볼트로 export(옵시디언 소유) | `vault.ts` |

> **Phase 7 — 통합 두뇌 웹 표면**: 위 레이어들을 *모든 프로젝트에 걸쳐* 한 화면에 노출(임베딩 0,
> 같은 인덱스+`claude --print` 원칙). `brain-index.ts`(전 프로젝트 위키·노트·개념 카탈로그,
> `GET /api/brain/index`) · `session-search.ts`(전 프로젝트 대화 FTS5 검색, `GET /api/brain/search`) ·
> `recall-global.ts`(전역 의미 회상, `POST /api/brain/recall`) → `/watching/knowledge` 탐색기 +
> 전역 그래프 노트·개념 오버레이(`/api/wiki/graph/global?include=`). 상세: [phase-7-unified-brain.md](./phases/phase-7-unified-brain.md).

## 핵심 원칙 — 임베딩 안 씀 (Karpathy LLM-wiki)

[Karpathy의 LLM-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)를
따른다: 검색도 벡터가 아니라 **인덱스(제목 카탈로그)를 LLM이 읽고 의미로 고른 뒤
전체를 읽는다**. "~100k 토큰 아래선 RAG 불필요." 또 `claude --print`는 임베딩을
만들 수 없다(Anthropic 임베딩 API 없음). 그래서:

- **write-time distill**: 대화를 청크→임베딩하는 RAG가 아니라, 에이전트가 위키로
  정합 합성(`wiki.ts`, keyset 워터마크로 증분).
- **의미 회상**(`recall.ts` `selectRelevantNotesSemantic`): 노트 제목 인덱스 + 질문을
  `claude --print`에 주고 관련 slug를 고르게 → 위키링크 1–2홉 확장 → 예산 컷.
  "인증"이 단어 없는 OAuth 노트도 의미로 찾는다. 키워드 시드는 무LLM fallback.
- **금지**: 의미 검색/회상에 벡터DB·임베딩 모델 도입 금지. index + `claude --print`.

상세 결정: [ADR 0011](./decisions/0011-second-brain-llm-wiki.md).

## 자기개선 루프

```
새 대화 → auto-wiki(위키 증분 갱신) → cascade(낡은 노트/온톨로지/eval 재생성)
        → eval(위키 자가감사: 정확/최신/누락/voice 정렬, 0–100 신뢰점수)
        → 다음 위키 재생성 시 eval의 실행가능 이슈를 프롬프트에 피드백(자기교정)
        → eval 점수 추이로 신뢰가 실제로 오르는지 관측
```

- **스케줄러**(`auto-wiki.ts`): opt-in `HAETAE_WIKI_AUTO=true`. 기존 위키만·settle 디바운스·프로젝트별 쿨다운·single-flight. 위키 갱신 후 `cascade.ts`가 *이미 존재하고 낡아진* 파생물만 재생성(부트스트랩 안 함).
- **자기교정**(`wiki.ts` + `eval.ts evalCorrectionHints`): incremental 위키 재생성 시 최신 eval의 high/medium accuracy·gap·staleness 이슈를 `AUDIT FINDINGS`로 주입. "근거 있을 때만 고치고 지어내지 말 것"(보수적). 주관적 vibe·low 제외.
- **staleness**(`staleness.ts`): 파생물 generatedAt < 위키 generatedAt이면 낡음 → UI 배지.
- **관측성**: `project_eval_history`에 매 eval 점수 적재 → WikiEvalBar 추이 스파크라인. 루프가 천장(파생레이어 더 쌓아도 점수 안 오름)을 쳤는지 판단 근거.
- **스케줄러 상태 UI**: env-gated라 보이지 않던 루프를 노출 — `GET /api/wiki/auto-status`(`getAutoWikiStatus`: 켜짐 여부·주기·갱신 대기 candidates)가 OVERVIEW의 `BrainLoopPanel`에 표시. 읽기 전용(무LLM). (후속: 수동 트리거·활동 로그.)

## 영속성 (Persistence) — 페이로프

LLM은 세션마다 기억상실. 두뇌(STORE)가 *살아있는 AI 컨텍스트에 제때 전달(DELIVERY)*
돼야 의미가 있다. 정설(MemGPT 티어 / Generative Agents recency·importance·relevance /
Anthropic 메모리 툴 just-in-time / Karpathy index)과 일치하는 균형:
**작은 always-on 코어+인덱스 + relevance로 retrieve.**

- **주입**(`inject-wiki.ts`): 위키 생성 시 `.claude/CLAUDE.md`의 HAETAE 마커 블록에
  캡된 위키 코어 + **기억 인덱스**(원자 노트 제목, degree=중요도 정렬)를 주입. 위키가
  캡(8000자)으로 잘려도 인덱스로 *전체 지식 지도가 회상 가능*. `buildPersistentMemory`.
- **신뢰 게이트**(`trustLine`): 블록 헤더에 위키의 마지막 eval 점수 표기. 미검증/낮음이면
  경고 — *틀린 기억을 확신으로 주입하면 amnesia보다 나쁘다*(amnesia는 최소한 물어봄).
- **전역 voice**(`voice.ts injectProfileIntoGlobalClaudeMd`): 사용자 voice/정체성을
  `~/.claude/CLAUDE.md`에 주입(모든 세션). 덮어쓰기 전 `saveBackup`(하드룰).
- **on-demand 깊이**(`mcp/`): stdio MCP 서버가 `recall_notes`·`recall_global`·`ask_brain`
  노출 → Claude Code 세션이 인덱스를 보고 필요할 때 깊이를 retrieve. `recall_global`은
  **전 프로젝트 노트를 한 인덱스**(`[project/slug]` 키)로 묶어 의미 선택 — "하나의 두뇌"의
  첫 배관(프로젝트 두뇌가 늘수록 가치 상승). 등록:
  `claude mcp add haetae -- pnpm -C <repo> --filter haetae-server -s mcp`.

## 소유권 — 옵시디언 볼트 export

두뇌가 SQLite(`cache.db`)에만 살면 사용자가 소유·이식할 수 없다. `vault.ts`가
원자 노트(이미 kebab slug + 인라인 `[[slug]]`)를 노트당 `<slug>.md` + `index.md`
(카파시 카탈로그) + `_wiki.md`로 `<project>/.haetae/vault/`에 떨군다. 그 폴더를
옵시디언으로 열면 사용자가 자기 두뇌를 소유·편집·버전관리. WIKI 탭 버튼 / `POST
/api/wiki/vault/export`. `.haetae/`는 gitignore.

## 데이터 모델

파생 레이어는 프로젝트당 JSON-blob 1행(`project_wiki`는 증분, 나머지는 전량 재생성):
`project_wiki`(+`project_wiki_history`) · `project_notes` · `project_ontology` ·
`project_links` · `project_eval`(+`project_eval_history`) · `user_profile`(voice, 전역) ·
`memories`(compact 요약) · `session_messages`(JSONL 인덱서 소스).

> 알려진 부채: 노트·온톨로지·링크·eval은 *전량* 재생성(위키만 증분). 그 주된 피해인
> **식별자 churn**(regen마다 새 slug/id → 볼트 파일·그래프 노드·링크 깨짐)은 완화됨 —
> `generateNotes`/`generateOntology`가 직전 slug/id를 프롬프트에 주고 지속 아이디어엔
> 재사용을 지시(식별자 안정성). 완전 증분화(위키 delta→노트 delta)는 깨끗한 매핑이
> 없어 여전히 미해결(필요 시 추후).

## 데스크톱

Tauri 셸([ADR 0012](./decisions/0012-tauri-desktop.md), `apps/desktop`). v1은 `tauri dev`가
`beforeDevCommand`로 web+server 자동 기동. v2(번들 standalone)는 Rust 사이드카로
번들 Node 서버 spawn 예정.
