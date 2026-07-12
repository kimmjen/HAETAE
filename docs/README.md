# Haetae 명세

Haetae(해태) 는 Claude Code 의 규칙·스킬을 시각적으로 관리하고 토큰 사용을 분별하는 **단일 사용자 로컬 콘솔** (macOS-first).

- **유래**: 한국 전통 신수 해태(獬豸) — 시비곡직(是非曲直) 을 가리는 영물. 광화문 해태상처럼 작업 환경을 지키는 개인 수호자.
- **배포 정책**: 로컬 전용. 외부 호스팅·배포·공유 일체 없음. 인증·멀티유저 미고려. 추후 Tauri 데스크톱 앱화 가능성만 열어둠.

## 문서 인덱스

### 무엇을 만드는가
- [현재 상태](./status.md) — 머지된 PR, 완료 항목, 다음 단계
- [핵심 요구사항](./requirements.md) — Watching / Guarding / Working / 메타 기능
- [로드맵](./roadmap.md) — Phase 0~6, 각 단계 검증 기준

### 어떻게 만드는가
- [기술 스택](./stack.md) — 확정/미확정 라이브러리
- [아키텍처](./architecture.md) — 모노레포, 보안, 데이터 플로우
- [세컨드 브레인](./second-brain.md) — 메모리 파이프라인(위키/노트/온톨로지/eval/voice), 자기개선 루프, 영속성·MCP·볼트 export, 임베딩 안 쓰는 이유
- [디자인 시스템](./design-system.md) — 3-tier 토큰, 컨벤션
- [이식성](./portability.md) — 새 머신 setup, 동기화 대상

### 어떻게 일하는가
- [개발 워크플로우](./workflow.md) — Git 풀 사이클, 커밋, 코드 컨벤션, 머지 체크리스트

### 결정 기록
- [결정 인덱스](./decisions/README.md) — 확정/미확정 한눈에
- [ADR 0001 — Vite over Next.js](./decisions/0001-vite-over-nextjs.md)
- [ADR 0002 — Monorepo split](./decisions/0002-monorepo-split.md)
- [ADR 0003 — Fastify server](./decisions/0003-fastify-server.md)
- [ADR 0004 — TanStack Router](./decisions/0004-tanstack-router.md)
- [ADR 0005 — SQLite + Drizzle](./decisions/0005-sqlite-drizzle.md)
- [미확정 결정 (Pending)](./decisions/pending.md)

### Phase 별 상세
- [Phase 3 — 통합 터미널](./phases/phase-3-terminal.md) — xterm.js + PTY + WebSocket 명세
- [Phase 7 — 통합 두뇌 뷰](./phases/phase-7-unified-brain.md) — 전 프로젝트·전 대화 통합 질의/탐색 (기획)

### 연구 메모 (research/)
- [Claude Code 의 로컬 데이터 소스](./research/claude-code-data-sources.md) — 구독 정보 / 5h-7d 잔량 / `~/.claude/` 트리. 해당 데이터 소비 ADR 의 근거.
