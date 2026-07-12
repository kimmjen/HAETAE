# 이식성 — 새 머신 옮길 때

## 이상적 setup 시퀀스

```bash
# 1. mise 설치 (한 번)
curl https://mise.run | sh

# 2. 레포 클론
git clone https://github.com/kimmjen/HAETAE.git ~/projects/haetae
cd ~/projects/haetae

# 3. 부트스트랩
bash scripts/bootstrap.sh

# 4. Admin API Key 입력 (선택, Phase 5 부터)
#    1Password CLI / Bitwarden / macOS Keychain 으로 주입 권장

# 5. 실행
pnpm dev
```

`bootstrap.sh` 가 하는 일:
1. `mise` 설치 여부 확인 → 없으면 안내 후 종료
2. `mise install` 으로 `.tool-versions` 의 Node + pnpm 설치
3. `pnpm install` 로 워크스페이스 의존성 설치 (`better-sqlite3`·`node-pty` 네이티브 빌드 포함)
4. `apps/notebooklm` Python venv 생성 + 의존성 + Playwright chromium (NotebookLM 재인증용)
5. 다음 단계 안내

## 동기화 대상 / 비대상

| 항목 | 동기화? | 방법 |
|---|---|---|
| Haetae 소스 코드 | Yes | git |
| `~/.claude/` (Claude Code 데이터) | 사용자 책임 | dotfiles / Claude Code 재로그인 |
| Haetae cache.db | No | 새 머신에서 자동 재생성 (jsonl 재인덱싱) |
| 테마 설정 (localStorage) | No | 새 머신에서 재선택 |
| 비용 임계치 (5h / daily / weekly / monthly) | No | localStorage — 새 머신에서 재입력 |
| Admin API Key (Phase 5) | Yes (수동) | 1Password / Keychain / `apps/server/.env.local` |
| Claude OAuth 토큰 (한도 fetch 용) | No | 새 머신에서 `claude auth login` 실행 |

## Claude CLI 연동 (선택)

HAETAE 가 다음 명령들을 shell out 으로 호출:

| 명령 / 저장소 | 사용처 | 실패 시 |
|---|---|---|
| `claude auth status --json` | 사이드바 ACCOUNT, Profile auth section | AUTH N/A 표시 |
| macOS: `security find-generic-password -s 'Claude Code-credentials' -w` · Linux/Windows: `~/.claude/.credentials.json` (또는 `$CLAUDE_CONFIG_DIR`) | Rolling Windows 의 진짜 5h / 7d 한도 % | Settings 임계치 fallback |

CLI 자체는 `https://claude.com/install/cli` 에서 설치. `claude auth login` 한 번 하면 OAuth 토큰이 저장돼(macOS=Keychain, Linux/Windows=`~/.claude/.credentials.json`) 두 기능 모두 활성화.

**3 platform 지원**: 한도 fetch 는 macOS(Keychain)·Linux·Windows 모두 동작. Linux/Windows 는 Claude Code 가 secret-tool / Credential Manager 가 아니라 `~/.claude/.credentials.json` 평문 파일(mode 0600)에 저장하므로 그 파일을 직접 읽는다(`$CLAUDE_CONFIG_DIR` 존중). 단 OAuth opt-in flag (`HAETAE_USE_OAUTH_LIMITS=true`) 가 필요.

근거: `docs/research/claude-code-data-sources.md`.

## 막힐 가능성 있는 지점

| 시점 | 원인 | 대응 |
|---|---|---|
| `pnpm install` | better-sqlite3 prebuilt 누락 | Python + C 컴파일러 (Xcode CLT) |
| Phase 3 도입 후 | node-pty 빌드 실패 | 결정 1 재검토 (Rust 이식) |
| `pnpm dev` | 포트 5173 / 3001 점유 | `HAETAE_SERVER_PORT` env override |
| Admin API 호출 | 키 누락 | UI 에서 안내 |
| 사이드바 \"AUTH N/A\" | `claude` CLI 없음 / 미로그인 | 선택 — 연동 원하면 `claude auth login` |
| Rolling Windows 셀이 임계치 fallback 만 | macOS 외 OS / OAuth 만료 / `/api/oauth/usage` schema 변경 | Settings 에서 사용자 임계치 입력해도 OK |

## Git author 권장 (선택)

오픈소스 공개 시 commit author email 이 모든 PR 의 메타데이터로 노출. 본인의 진짜 이메일을 가리고 싶으면 GitHub 의 noreply 별칭 사용:

```bash
# 이 repo 에서만 (다른 repo 에는 영향 없음)
git config user.email '<github-id>+<username>@users.noreply.github.com'
```

GitHub 계정 페이지의 \"Email settings → Keep my email addresses private\" 옵션과 같이 두면 자동.

## 외부 노출 방지

- 서버 바인딩 `127.0.0.1` ([architecture §보안 원칙](./architecture.md#보안-원칙))
- Admin Key 클라이언트 번들 미포함 (`VITE_*` prefix 절대 금지)
- `~/.claude/` 외 경로 차단 (FS 화이트리스트)
- PTY cwd 화이트리스트 (Phase 3)

## 빌드 프로덕션 모드 (선택)

`pnpm dev` 가 아닌 빌드 산출물로 사용하고 싶다면:

```bash
pnpm start:build       # pnpm build && pnpm start (한 번에)
# 또는 단계별:
pnpm build             # web 만 빌드 (server 는 tsx 로 source 직접 실행)
pnpm start             # NODE_ENV=production, server 가 web/dist 도 서빙
```

셸에서 인자 한 번에:
```bash
bash scripts/launch.sh --prod    # build + start
bash scripts/launch.sh           # 기본 dev 모드
```

### 단일 origin 패턴

prod 모드에서는 server (port 3001) 가:
- `/api/*` — 기존 API
- `/*` (그 외 모든 GET) — `apps/web/dist` 정적 파일 + SPA fallback (`index.html`)

장점: Vite proxy 없이도 `/api` 동작, 사용자가 외울 URL 하나 (`http://127.0.0.1:3001`), 보안 원칙 (127.0.0.1 only) 일관.

### 지속 실행 (선택)

`launchd` (macOS) / `systemd` (Linux) 서비스로 등록하는 게 자연스러움 (현재 미구현).
