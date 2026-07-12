# 아키텍처

## 모노레포 구조

```
haetae/
├── apps/
│   ├── web/                       # Vite + React UI (port 5173)
│   ├── server/                    # Fastify backend (port 3001)
│   └── notebooklm/                # NotebookLM 사이드카 (FastAPI, port 4100, ADR 0010)
├── docs/                          # 본 문서
├── scripts/
│   └── bootstrap.sh               # 새 머신 setup
├── pnpm-workspace.yaml
├── package.json                   # 루트 (concurrently)
├── .tool-versions                 # mise/asdf
└── README.md
```

`packages/shared` (공유 타입) 는 도입 후 필요 시.

## 실행 모델

- `pnpm dev` → `concurrently` 로 web (5173) + server (3001) + notebooklm (4100) 동시 기동
- web 의 `/api/*` 는 server 로, `/py/*` 는 notebooklm 사이드카로 프록시 (dev: Vite proxy / prod: Fastify)
- 단일 패키지 실행: `pnpm --filter haetae-web dev` 또는 `pnpm --filter haetae-server dev`

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
