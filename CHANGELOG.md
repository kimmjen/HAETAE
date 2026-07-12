# Changelog

## v0.1.0 — 2026-07-12

첫 공개 릴리스. Claude Code 를 위한 로컬 전용 개인 콘솔 + "AI를 위한 두 번째 뇌".

### Watching — 사용량 가시화
- `~/.claude` JSONL 자동 인덱싱 (부팅 + 30초 증분, 정수 micro-USD 정밀도)
- Overview 대시보드 — 롤링 윈도우(5h/24h/7d/월), 30일 추이, 캐시 인사이트, 히트맵
- Anthropic Admin API 미러 + Local vs API 비교 (Admin 키 선택)
- 전 프로젝트 세션 목록(LIVE 배지) + 메시지 타임라인 drill-down
- 실제 5h/7d 한도 % (opt-in, macOS Keychain / Linux·Windows credentials 파일)

### Second Brain — 자기개선 메모리
- 대화 → 프로젝트 위키 증분 정합 합성 (임베딩 없이 인덱스 + `claude --print`)
- 위키 → 원자 노트(제텔카스텐) · 타입 온톨로지 · 노트↔개념 링크 파생
- eval 자가감사(0–100 신뢰점수) → 위키 재생성 피드백 (자기교정 루프)
- 위키를 `.claude/CLAUDE.md` 에 2-tier 주입 — 다음 세션이 히스토리를 알고 시작
- MCP 회상 서버 (`recall_notes` · `recall_global` · `ask_brain`)
- 옵시디언 마크다운 볼트 export

### 통합 두뇌 뷰
- Knowledge — 전 프로젝트 위키·노트·개념 카탈로그 + 대화 전체검색(FTS5 trigram) + Ask(전역 의미 회상 / 프로젝트 Q&A)
- 그래프 — 프로젝트·노트·개념을 옵시디언식 라이브 그래프로 (레이어 토글, 노드 상세 패널)

### Guarding / Working / Research
- 룰·스킬·CLAUDE.md 관리 (화이트리스트 FS + 덮어쓰기 전 백업, Monaco 편집, diff)
- 통합 터미널 (node-pty, 멀티 탭, dock 영속, cwd 화이트리스트)
- NotebookLM 사이드카 (FastAPI) — 노트북 미러·Q&A·Settings 재인증

### 보안 원칙
- `127.0.0.1` 전용 바인딩, 단일 사용자, 시크릿은 서버 env 만 (클라이언트 번들 미포함)
