# 아키텍처

## 모노레포 구조

```
haetae/
├── apps/
│   ├── web/                       # Vite + React UI (port 5173)
│   ├── server/                    # Fastify backend (port 3001)
│   ├── notebooklm/                # NotebookLM 사이드카 (FastAPI, port 4100, ADR 0010)
│   └── desktop/                   # Tauri 셸 (ADR 0012) — v1 은 dev 래퍼
├── docs/                          # 본 문서
├── scripts/
│   └── bootstrap.sh               # 새 머신 setup
├── pnpm-workspace.yaml
├── package.json                   # 루트 (concurrently)
├── .tool-versions                 # mise/asdf
└── README.md
```

`packages/shared` (공유 타입) 는 도입 후 필요 시. 웹이 서버 모듈을 import 할 수
없어 생기는 소수의 미러(예: 모델 목록 `apps/web/src/lib/models.ts` ↔
`services/memory/claude-cli.ts`)는 공유 패키지 대신 **드리프트를 잡는 테스트**로
묶어둔다 — 서버 테스트가 웹 파일을 읽어 목록이 갈리면 실패한다.

## 실행 모델

- `pnpm dev` → `concurrently` 로 web (5173) + server (3001) + notebooklm (4100) 동시 기동
- web 의 `/api/*` 는 server 로, `/py/*` 는 notebooklm 사이드카로 프록시 (dev: Vite proxy / prod: Fastify)
- 단일 패키지 실행: `pnpm --filter haetae-web dev` 또는 `pnpm --filter haetae-server dev`

### 백그라운드 루프 — 무엇이 언제 도는가

서버 프로세스 안에서 도는 것과, 서버와 무관하게 도는 것이 갈린다. **HAETAE 를
상주시킬 필요가 있는지**가 여기서 갈리므로 셋을 구분해 둔다.

| 루프 | 주기 | 서버 필요 | 기본값 |
|---|---|---|---|
| 사용량 인덱서 | 부팅 시 1회 + 30초 (`HAETAE_INDEXER_INTERVAL_MS`) | **필요** | 켜짐 (`0` 이면 주기 tick 없이 부팅 1회만) |
| 위키 자동 갱신 | 5분 스캔 · 10분 정착 디바운스 · 프로젝트당 30분 쿨다운 | **필요** | **꺼짐** — `HAETAE_WIKI_AUTO=true` opt-in |
| SessionEnd fold | Claude Code 세션이 끝날 때마다 | **불필요** | 훅을 설치했을 때만 |

**서버를 상주시키지 않으면** 무슨 일이 생기나:

- **사용량** — 아무것도 잃지 않는다. 인덱서는 파일별 커서로 증분이라, 다음에 앱을 열면 그동안 쌓인 JSONL 을 부팅 시 한 번에 따라잡는다. 손실이 아니라 지연이다.
- **두뇌** — 자동 갱신 스케줄러는 서버 안에 살므로 같이 멈춘다. 대신 **SessionEnd 훅**(`apps/server/scripts/session-end-fold.sh`)이 이 경우를 위해 있다: 세션이 끝나면 detached 백그라운드로 `update-brain` 을 띄워 접는다 — 상주 서버 없이 두뇌가 최신을 유지한다. 훅도 스케줄러도 없으면 위키는 버튼을 눌러야 갱신된다(그게 기본값이다).

둘 다 Claude quota 를 쓰므로 기본이 꺼져 있다. 훅 쪽 빈도는
`HAETAE_SESSION_FOLD_MIN_DELTA`(기본 30개 메시지)와
`HAETAE_SESSION_FOLD_COOLDOWN_MS`(기본 20분)로 조인다.

### 상주 실행 (데몬)

**전용 데몬은 없다.** launchd·systemd 유닛을 제공하지 않으므로, 항상 켜두고 싶으면
`pnpm start`(프로덕션 단일 origin, :3001)를 각자 OS 의 서비스 매니저에 직접
등록해야 한다. 앱으로 감싸는 방향(Tauri)은 [ADR 0012](./decisions/0012-tauri-desktop.md)
이고 v1 은 `tauri dev` 래퍼까지다 — 번들 standalone 은 미정이라, 그때까지는
`pnpm start` 를 등록하는 쪽이 유일한 상주 경로다.

대부분의 경우 상주는 필요 없다. 앱을 열 때 따라잡고, 두뇌는 SessionEnd 훅으로
충분하다.

## 보안 원칙

| 항목 | 정책 |
|---|---|
| 서버 바인딩 | `127.0.0.1` only — `0.0.0.0` 절대 금지 |
| Admin API Key | 서버 환경변수만. 클라이언트 번들 미포함. `VITE_` prefix 금지 |
| FS 화이트리스트 | 사전 허용 경로 prefix 만 접근 가능 |
| PTY cwd | 화이트리스트 경로에서만 셸 시작 |
| 영구삭제 | 직접 unlink 금지 — 휴지통 또는 `.bak` 보관 |

### 환경변수 분리

| 위치 | 규칙 |
|---|---|
| `apps/web/.env.local` | **`VITE_*` prefix 변수만**. Vite 가 클라이언트 번들에 inline 하므로 secret 절대 금지. 현재 수용 변수: `HAETAE_SERVER_PORT` (proxy target, 비밀 아님) |
| `apps/server/.env.local` | 자유. `ANTHROPIC_ADMIN_KEY`, `HAETAE_DB_PATH`, `HAETAE_CLAUDE_HOME`, `HAETAE_DEBUG` 등 모두 여기 |
| 루트 `.env` | 사용 안 함 (어느 패키지가 읽을지 모호) |

**검증**: `pnpm build && grep -rE 'sk-ant-[A-Za-z0-9_-]{20,}' apps/web/dist/` 가 무결과여야 함 (실 키 *값* 기준 — 라벨 `ANTHROPIC_ADMIN_KEY` 나 placeholder `sk-ant-admin-...` 가 번들에 있는 건 누출 아님).

## 데이터 플로우

```
[페이지 컴포넌트]
       ↓ useQuery / useMutation
[lib/api-client.ts]
       ↓ fetch('/api/...')
[Vite proxy]
       ↓ http://127.0.0.1:3001
[Fastify 라우트]
       ↓
[services/* 비즈니스 로직]
       ↓
[FS(~/.claude) / SQLite (Drizzle) / Anthropic Admin API / PTY / claude --print(LLM)]
```

라우트는 얇게, 비즈니스 로직은 `services/` 에 집약. 서버 언어가 바뀌어도 `services/` 만 다시 짜면 되도록.

**2차 뇌 + Phase 7**: `services/memory/*`(위키·노트·온톨로지·eval·voice·recall·그래프)와 그 cross-project 표면(`/api/brain/{index,search,recall}` — Phase 7 통합 두뇌 뷰)은 임베딩 없이 같은 `claude --print` 경로를 공유한다 — 상세는 [second-brain.md](./second-brain.md). NotebookLM 연동은 `/py/*` → 별도 FastAPI 사이드카(`apps/notebooklm`, ADR 0010)로 빠지며, 자체 Python SQLite 미러를 둔다.

## 서버 서브시스템

라우트 파일별 담당 영역과 그 뒤의 저장소. 새 기여자가 "이 기능은 어디를 고쳐야
하나"를 여기서 찾는다.

| 영역 | 라우트 | 저장소 |
|---|---|---|
| usage (로컬 JSONL 인덱서) | `/api/usage/local/*` | `usage_events`, `usage_file_cursor`, `session_messages` |
| usage-api (Anthropic Admin) | `/api/usage/api/*` | `usage_api_events` |
| claude-fs (룰·스킬·CLAUDE.md) | `/api/rules`, `/api/claude-md` | FS(`~/.claude`) + `file_backups` |
| projects / system | `/api/projects*`, `/api/system/*` | `project_roots` + `claude` CLI 프로브 |
| pty (통합 터미널) | `/ws/terminal` | PTY 메모리 (영속 없음) |
| memory (2차 뇌) | `/api/wiki/*`, `/api/voice/*`, `/api/memories` | `project_{wiki,notes,ontology,links,eval,topics}`, `*_history`, `user_profile`, `memories`, `external_sources` |
| brain (Phase 7 + 전역) | `/api/brain/{index,search,recall}`, `/api/brain/global/*` | 위 테이블 조회 + FTS5 + `global_{wiki,topics,eval}` |
| NotebookLM 사이드카 | `/py/notebooklm/*` (FastAPI :4100) | 별도 Python SQLite |

**비용 정밀도**: `usage_events.cost_usd_micro` 는 정수 micro-USD(USD × 1e6). SQLite
가 float 를 보지 않으므로 합계·집계가 정확하다. UI 경계에서만 1e6 으로 나눈다.

비용은 **인덱싱 시점에 굳는다** — 인덱서는 `(session_id, message_id)` UNIQUE 로
멱등이라 기존 행을 다시 보지 않는다. 따라서 `services/usage/pricing.ts` 의 단가를
고쳐도 과거 집계는 그대로다. 저장된 토큰으로 제자리 재계산하려면
`pnpm --filter haetae-server reprice`(기본 dry run, `--apply` 로 기록).

## 사용자 데이터 위치

OS 표준 컨벤션 사용 (`env-paths` 패키지):

| OS | 경로 |
|---|---|
| macOS | `~/Library/Application Support/haetae/` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/haetae/` |
| Windows | `%APPDATA%\haetae\` |

- `HAETAE_DB_PATH` env 로 디렉터리 override 가능
- `~/.claude/` 위치는 `HAETAE_CLAUDE_HOME` 으로 추상화 (Phase 1 claude-fs PR 에서 적용)
- `cache.db` 는 `~/.claude/` 로부터 재생성 가능 — 머신 옮길 때 cache 동기화 불필요
