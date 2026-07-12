# Phase 3 — 통합 터미널

## 컨셉

VS Code 통합 터미널 / Coder / Warp 가 쓰는 검증된 패턴: xterm.js (브라우저) + PTY 라이브러리 (서버) + WebSocket.

## 데이터 플로우

```
[브라우저: xterm.js]
       ↑↓ WebSocket (ws://127.0.0.1:3001/ws/terminal)
[서버: WebSocket 핸들러]
       ↑↓ stdin/stdout
[PTY 라이브러리]
       ↑↓ PTY 디바이스
[OS: /bin/zsh 또는 /bin/bash]
```

`child_process` 로는 안 됨. `claude` 같은 인터랙티브 TUI 는 진짜 PTY 가 필요 (TTY 감지, 색상, 화살표 키).

## 클라이언트 의존성 (P3.2 진입 시 추가)

```
@xterm/xterm
@xterm/addon-fit          # 컨테이너 크기 맞춤
@xterm/addon-web-links    # URL 클릭
@xterm/addon-search       # Ctrl+F 검색
@xterm/addon-unicode11    # 한글·이모지 폭
@xterm/addon-webgl        # 렌더링 성능 (선택)
```

## 서버 의존성

ADR 0003 에 따라 Node + Fastify 유지. P3.1 에서 추가:

- `@fastify/websocket`
- `node-pty` — 네이티브 빌드 필요 (macOS Xcode CLT, Linux build-essential + python3)

`pnpm-workspace.yaml` 의 `allowBuilds` 에 `node-pty: true` 추가됨 (better-sqlite3 / esbuild 와 동일 패턴).

## PTY 매니저 인터페이스

```ts
interface PtySession {
  id: string;
  pty: IPty;
  cwd: string;
  shell: string;
  createdAt: Date;
  lastActivity: Date;
}

class PtyManager {
  create(opts: { cwd?: string; cols?: number; rows?: number }): PtySession;
  get(id: string): PtySession | undefined;
  resize(id: string, cols: number, rows: number): void;
  write(id: string, data: string): void;
  kill(id: string): void;
  startCleanupInterval(): void;  // 5분 비활성 자동 정리
}
```

## WebSocket 메시지 프로토콜

클라이언트 → 서버:
```ts
{ type: "input",  data: string }
{ type: "resize", cols: number, rows: number }
```

서버 → 클라이언트:
```ts
{ type: "output", data: string }
{ type: "exit",   exitCode: number }
```

## 보안 가드 (P3.1 구현 반영)

cwd 화이트리스트는 P2.5 의 project_roots 시스템과 통합. 허용 목록:

- `getClaudeHome()` — `~/.claude` 또는 `HAETAE_CLAUDE_HOME` 오버라이드
- `getProjectRoots()` — `HAETAE_PROJECT_ROOTS` env 의 모든 항목
- `getUserRoots(db)` — `project_roots` 테이블의 모든 항목

서비스: `services/pty/cwd-guard.ts`. 절대경로 + 디렉터리 + 위 prefix 안 검증.
에러 매핑: `CwdInvalidError` → WS close 4400, `CwdNotAllowedError` → 4403.

추가 가드:
- 서버 `127.0.0.1` 바인딩
- WebSocket close 시 PTY 즉시 kill
- 5분 이상 비활성 세션 자동 kill
- xterm scrollback 1000줄 제한 (메모리 보호)

## 멀티 탭 구조

탭 비활성 시 `display: none` 으로만 처리. 컴포넌트는 살아있어야 셸 세션 유지.

```tsx
{tabs.map(tab => (
  <div key={tab.id} className={tab.id === activeId ? "h-full" : "hidden"}>
    <Terminal cwd={tab.cwd} />
  </div>
))}
```

## 단축키 (VS Code 호환)

| 키 | 동작 | 브라우저 |
|---|---|---|
| `Cmd/Ctrl + T` | 새 탭 | OS reserved (Tauri 에서만) |
| `Cmd/Ctrl + Shift + \`` | 새 탭 (브라우저 fallback) | OK |
| `Cmd/Ctrl + W` | 현재 탭 닫기 | OS reserved (Tauri 에서만) |
| `Cmd/Ctrl + 1~9` | N번째 탭 이동 | OS reserved (Tauri 에서만) |
| `Cmd/Ctrl + Shift + ]` | 다음 탭 | OK |
| `Cmd/Ctrl + Shift + [` | 이전 탭 | OK |
| `Cmd/Ctrl + F` | 터미널 내 검색 | OK (preventDefault) |
| `Cmd/Ctrl + K` | 터미널 출력 지우기 (xterm 포커스 시만) | OK |

브라우저는 `Cmd+T` / `Cmd+W` / `Cmd+1..9` 를 OS chrome 차원에서 가로채므로 keydown 이 JS 까지 도달하지 않는다. 바인딩은 그대로 두지만 (Phase 5 Tauri 에서 동작), 브라우저 사용자는 새 탭의 경우 `Cmd+Shift+\`` (VS Code 의 'Create New Terminal' 표준 키) 를 사용. 닫기/번호 이동은 × 버튼·우클릭 메뉴·`Cmd+Shift+]/[` 로 대체.

`Cmd+K` 는 xterm 포커스 시 터미널 동작, 그 외엔 명령 팔레트.

## 다른 페이지 연동

```tsx
// 프로젝트 페이지
<Button onClick={() => navigate({
  to: "/working/terminal",
  search: { cwd: project.path, autoCommand: "claude" },
})}>
  Claude Code 시작
</Button>

// 세션 상세
<Button onClick={() => openTerminal({
  cwd: session.projectPath,
  autoCommand: `claude --resume ${session.id}`,
})}>
  이 세션 다시 열기
</Button>
```

URL search params (`cwd`, `autoCommand`) 로 전달. 터미널 페이지가 받아서 새 탭 + 명령 자동 입력.

## 디자인 토큰 추가 (ANSI 16색)

ADR 0008 에 따라 Bloomberg 단일 팔레트. 3-tier (primitive → semantic → component) 패턴 그대로 적용 — 기존 `--bb-*`, `--hanji-*`, `--night-*` 와 같은 위치 (`apps/web/src/index.css`) 에 추가.

```css
/* Primitive — Phase 3 P3.2 에서 신규 */
:root {
  --bloomberg-ansi-black: #1a1a1a;
  --bloomberg-ansi-red: #c83232;     /* 채도 살림 — error 의미 */
  --bloomberg-ansi-green: #4a8c4a;   /* 채도 살림 — success */
  --bloomberg-ansi-yellow: #c8a040;  /* 채도 살림 — warning */
  --bloomberg-ansi-blue: #4a7ec8;    /* accent 톤 */
  --bloomberg-ansi-magenta: #8060a0;
  --bloomberg-ansi-cyan: #4090a0;
  --bloomberg-ansi-white: #c8c8c8;
  /* bright 8개 동일 패턴 */
}

/* Semantic — light theme */
:root {
  --app-ansi-0: var(--bloomberg-ansi-black);
  --app-ansi-1: var(--bloomberg-ansi-red);
  /* ... 16개 매핑 */
  --app-terminal-bg: var(--app-bg-primary);
  --app-terminal-fg: var(--app-text-main);
  --app-terminal-cursor: var(--app-accent);
  --app-terminal-selection: var(--app-bg-hover);
}
.dark { /* 다크 오버라이드 */ }

/* Component — Tailwind 노출 */
@theme {
  --color-ansi-0: var(--app-ansi-0);
  --color-ansi-1: var(--app-ansi-1);
  /* ... */
}
```

xterm 테마는 `getComputedStyle(document.documentElement).getPropertyValue("--color-ansi-N")` 로 런타임 추출 — 다크/라이트 토글 시 `term.options.theme = newTheme` 으로 갱신.
