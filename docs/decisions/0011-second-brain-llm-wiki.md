# ADR 0011 — 세컨드 브레인 = LLM-wiki (임베딩/RAG 안 씀)

Status: Accepted
Date: 2026-06-09

## Context

HAETAE의 북극성은 "AI를 위한 세컨드 브레인" — Claude Code 대화를 영구 지식으로 정제해
다음 세션의 AI가 맥락 재설명 없이 쓰게 한다. 지식을 구조화·검색하는 방식에 두 갈래가 있다:

1. **RAG**: 대화를 청크 → 임베딩 → 벡터DB → 질의 시 top-k 검색.
2. **LLM-wiki**(Karpathy): 에이전트가 위키로 정합 합성 → 검색은 index(요약 카탈로그)를
   LLM이 읽고 의미로 골라 전체를 읽음. "~100k 토큰 아래선 RAG 불필요."

추가 제약: `claude --print`는 임베딩을 만들 수 없다(Anthropic 임베딩 API 없음). 임베딩을
하려면 로컬 모델 다운로드(onnxruntime 등) 또는 클라우드 임베딩 API가 필요한데, 후자는
개인 노트를 외부로 보내 local-only·프라이버시 해자에 어긋난다.

## Decision

**옵션 2 (LLM-wiki), 임베딩 0.**

- **write-time distill**: `wiki.ts`가 대화를 정합 합성(keyset 워터마크로 증분 흡수, 누적·정합).
- **계층**: 위키 → 원자 노트(제텔카스텐, `[[slug]]`) → 타입 온톨로지(개념+관계) →
  노트↔개념 링크 → eval(자가감사). 각 파생물은 JSON-blob 레이어.
- **의미 검색/회상**: 노트 제목 인덱스 + 질문을 `claude --print`에 주고 관련 slug 선택
  (`recall.ts`) → 위키링크 확장 → 예산 컷. 키워드 시드는 무LLM fallback. MCP·그래프
  검색이 같은 선택기 재사용.
- **금지**: 의미 검색/회상에 벡터DB·임베딩 모델 도입 금지. index + `claude --print`.

자기개선 루프(auto-wiki → cascade → eval → 자기교정 → 점수 추이)와 영속성(`.claude/CLAUDE.md`
주입 + 기억 인덱스 + 신뢰 게이트 + 전역 voice + MCP recall)은 [second-brain.md](../second-brain.md) 참조.

## Consequences

### 긍정
- 임베딩 인프라(벡터DB·모델·재인덱싱) 0 — local-only·무외부전송 유지(해자 보존).
- 위키가 통째로 컨텍스트에 들어가는 규모에선 정합 합성이 RAG 청크 단편화보다 우수.
- 출처표기·voice 정렬·자가감사가 자연스러움.

### 부정 / 비용
- 코퍼스가 매우 커지면(>100k 토큰/프로젝트) index 선택 + 부분 읽기로 한계 — 그때 BM25 등
  보조 검색이 옵션(여전히 임베딩 불필요).
- 파생 레이어 전량 재생성(위키만 증분) → 규모에서 LLM 비용·식별자 churn. 증분화 후속 과제.
