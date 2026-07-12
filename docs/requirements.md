# 핵심 요구사항

## 1. Watching — 토큰 사용량 분석

해태가 "지켜보는" 영역. 두 데이터 원천을 통합해 흐름을 분별.

### 소스 A — Claude Code 로컬 로그

- `~/.claude/projects/<hash>/*.jsonl` 파싱
- 세션·메시지 단위 input / output / cache_read / cache_creation 토큰
- 프로젝트 경로 (cwd), 세션 ID, 모델명, 타임스탬프
- SQLite 캐시: (파일경로, mtime) 기준 변경분만 재파싱

### 소스 B — Anthropic Admin API

- Admin API Key 는 서버 측 환경변수만 사용 (클라이언트 번들 절대 미포함)
- Usage Report (`/v1/organizations/usage_report/messages`)
- Cost Report (`/v1/organizations/cost_report`)
- 일별·모델별·워크스페이스별 집계 + USD 비용
- SQLite 캐시로 반복 호출 최소화

### 대시보드 구성

- 요약 카드: 오늘 / 이번 주 / 이번 달 토큰·비용 (소스 A·B 분리 표시)
- 일별 추이: 영역 차트, input/output/cache 스택, 모델별 색
- 프로젝트별 사용량: 막대 차트
- 모델별 분포: 도넛 차트
- 시간대별 활동 히트맵: 요일×시간대
- 캐시 효율성: `cacheRead / (input + cacheRead)` 비율
- 세션 테이블: 최근 세션, 클릭 시 메시지 흐름 보기
- Unified 비교: 같은 기간 두 소스 토큰 합계 일치 검증

## 2. Guarding — 규칙·스킬 관리

해태가 "관장하는" 영역. 규칙들이 잘 정돈되고, 누락이나 충돌이 없도록 분별.

### 대상 파일 시스템

- 글로벌: `~/.claude/` (CLAUDE.md, rules/, skills/, agents/, commands/)
- 프로젝트별: 각 프로젝트의 `.claude/`

### 기능

- 글로벌과 프로젝트 디렉터리를 통합 트리 뷰로 표시
- 마크다운 인라인 편집 (Monaco, frontmatter 신택스 하이라이팅)
- 스킬 생성 위저드: 이름·description·옵션 토글·본문 폼 입력
- 글로벌 ↔ 프로젝트 파일 이동·복사
- 동일 이름 파일이 양쪽에 있을 때 diff 비교
- 편집 전 자동 백업 (`.bak` 또는 SQLite history)
- 위험 작업 보호: 화이트리스트 외 경로 차단, 영구삭제 대신 휴지통
- 통합 검색: 마크다운 본문 + frontmatter (fuse.js)
- 스킬 description 작성 가이드: 좋은/나쁜 예 inline

## 3. Working — 통합 터미널 (Phase 3)

해태 안에서 직접 셸을 실행해 Claude Code 등 명령을 사용. 외부 터미널 앱과 해태를 오가지 않고 한 화면에서.

### 가능한 시나리오

- 프로젝트 페이지에서 "여기서 터미널 열기" → 해당 cwd 에서 셸 시작
- 규칙·스킬 편집 후 "테스트하기" → `claude` 자동 실행
- 세션 페이지에서 "다시 열기" → `claude --resume <session-id>` 자동 입력
- 멀티 탭으로 여러 프로젝트의 Claude Code 동시 진행

상세는 [Phase 3 통합 터미널 명세](./phases/phase-3-terminal.md).

## 4. 메타 기능

- 프로젝트 목록과 마지막 사용 시각
- 통합 검색 (`Cmd+K` 명령 팔레트)
- 단축키로 주요 작업 (파일 열기, 새 스킬, 페이지 이동, 터미널 새 탭 등)

## 비기능 요구사항

- 성능: 초기 파싱 5초 이내 (수백 MB JSONL 기준), 이후 캐시
- 안정성: 파일 쓰기 시 백업, 화이트리스트 검증
- 유지보수: 의존성 최소, 비즈니스 로직은 `services/` 에 집약
- 확장성: FS 로직과 UI 분리 — 추후 서버 언어 교체 / Tauri 전환 용이
