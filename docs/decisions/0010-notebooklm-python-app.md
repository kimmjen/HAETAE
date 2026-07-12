# ADR 0010 — NotebookLM = Python(FastAPI) 1급 앱 (멀티런타임 모노레포)

Status: Accepted
Date: 2026-06-04

## Context

ADR 0009 / #262는 NotebookLM을 Node(Fastify) 서버가 비공식 `notebooklm` CLI를 spawn하는 방식으로 통합했다. 동작은 했으나(라이브 검증 완료) 다음 한계가 드러났다:

- **bin 경로 의존** — 서버가 `notebooklm` 바이너리를 PATH/환경변수로 찾아야 함.
- **인터랙티브 프롬프트** — 비공식 CLI가 헤드리스 spawn에서 `[y/N]` 확인(예: `ask --new`)으로 abort. CLI 표면은 대화형 사용 전제라 서버 호출에 취약.
- **라이브러리 < CLI** — `notebooklm-py`는 Python 라이브러리인데 CLI 표면으로만 접근해 기능·구조화 출력 손실.

NotebookLM의 본체가 Python이므로, Node가 CLI를 셸 호출하는 것은 임피던스 불일치다.

후보:
1. CLI 호출 방식 유지(#262) — 위 한계 지속.
2. **Fastify 전면 → Python 재작성** — node-pty 터미널·`~/.claude` jsonl 인덱서·claude subprocess 등 Node 네이티브 자산을 폐기·재작성. 고위험, NotebookLM 하나를 위해 잘 도는 기능을 버림.
3. **멀티런타임 모노레포** — Node 서버는 잘하는 일 유지, Python은 1급 앱으로 추가.

## Decision

**옵션 3.** `apps/notebooklm`을 FastAPI 1급 앱으로 추가하고 `notebooklm-py`를 라이브러리로 직접 사용한다. Node 서버(Fastify, ADR 0003)는 터미널·사용량 인덱싱·claude subprocess 등 Node 네이티브 책임을 그대로 유지한다.

연결·보안·영속:

- **same-origin 유지(프록시):** dev는 `apps/web/vite.config.ts`에 `/py` 프록시 → `http://127.0.0.1:4100`. prod는 `apps/server`가 `@fastify/http-proxy`로 `/py/*` → :4100 포워딩(단일 오리진 :3001). 프론트 `api-client`는 상대경로 유지.
- **보안:** FastAPI에 loopback-only 가드 미들웨어를 `apps/server/src/security/local-guard.ts`의 `assessLocalRequest`와 동치로 복제(Host 필수+loopback, Origin 존재 시 loopback). defense-in-depth.
- **영속:** NotebookLM 데이터(notebooks/sources/qa/content)는 Python 자체 SQLite가 소유. Node Drizzle의 `notebooklm_*` 테이블은 이전 후 제거.
- **동시성:** `notebooklm-py` 호출에 asyncio 세마포어(claude-cli.ts의 MAX_CONCURRENT 패턴 Python판).
- **런타임:** `.tool-versions`에 Python 3.12 핀. notebooklm-py는 `apps/notebooklm` venv(루트 비오염). 인증은 기존 `~/.notebooklm/profiles/` 재사용.

## Consequences

### 긍정
- Python 자산을 임피던스 불일치 없이 라이브러리로 직접 사용.
- Node 네이티브 기능(터미널·인덱서) 보존 — 무위험.
- 모노레포가 멀티런타임을 1급으로 수용 → 향후 Python 기능의 자리 확보.

### 부정 / 비용
- 모노레포에 두 번째 런타임(Python) — bootstrap/dev 오케스트레이션·CI에 venv 단계 추가.
- prod에서 Fastify가 Python으로 프록시 — 프로세스 하나 더 관리.
- 비공식 `notebooklm-py` 의존은 여전 — graceful degrade 유지.

### 미정 / 후속
- NotebookLM 내용 → `projectNotes`/`projectOntology` 온톨로지 동기화는 여전히 후속.

## Alternatives considered

- **CLI 유지(#262):** bin/프롬프트/라이브러리 한계로 기각(단, 머지해 동작 보존 후 본 결정으로 대체).
- **Fastify 전면 재작성:** node-pty·jsonl 인덱서 폐기 비용이 과도해 기각.

## Re-evaluation trigger

- Python 앱이 NotebookLM 외 책임을 거의 안 갖게 되면 → 더 단순한 통합으로 회귀 검토.
- `@fastify/http-proxy` prod 경로가 운영 부담이 되면 → 배치 재고.

## 관계

ADR 0009를 대체(supersede). 이슈 #263.
