# Claude Code 의 로컬 데이터 소스 — 무엇이 어디에 있는가

마지막 갱신: 2026-05-04

> 이 문서는 **연구 메모** 다. ADR 도, 설계 결정도 아니다.
> HAETAE 가 \"내가 무엇을 구독중인지\" / \"5시간 세션 잔량\" /
> \"위클리 잔량\" 을 표시하지 못하는 이유를 정리하면서 어떤 데이터
> 가 어느 경로에 있는지 일일이 검증한 결과를 기록.
> 추후 결정이 ADR 로 승격되면 이 문서는 그 ADR 의 \"근거\" 로 인용.

---

## 동기

`claude` CLI 의 interactive TUI 안에서 `/config` 또는 `/usage` 를
치면 다음이 표시된다 (사용자 보고 + 본 연구로 확인):

- 구독 등급 (Pro / Max / Team)
- 현재 5-hour 세션 윈도우 사용량
- 위클리 사용량 + 다음 reset 시각

HAETAE 의 어느 페이지에도 이 정보가 없다. \"내 도구\" 라면 가장
먼저 보여야 하는 정보 인데. 이 갭을 메우려면 **그 데이터가 정확히
어디에 있는지** 부터 알아야 했다.

---

## 1. `~/.claude/` 와 사용자 프로파일 디렉터리

```bash
$ ls -la ~/.claude/
backups/                   파일 편집 백업
cache/                     CLI 의 일반 캐시 (changelog 등)
file-history/              편집 이력
history.jsonl              CLI 명령 history
ide/                       IDE 통합 메타
image-cache/               붙여넣은 이미지 캐시
mcp-needs-auth-cache.json  MCP 인증 필요 표식
paste-cache/               (큼) 붙여넣은 컨텐츠
plans/                     plan-mode 산출물 (대화 plan ≠ 구독 plan)
plugins/                   플러그인
projects/                  ★ HAETAE 가 이미 사용 중 — jsonl 세션 로그
session-env/               세션 별 env snapshot
sessions/                  ★ active session metadata (ProcessID 키)
settings.json              ★ 사용자 글로벌 설정 (model 등)
settings.local.json        머신 별 override (permissions allow 등)
shell-snapshots/           bash/zsh 환경 스냅샷
stats-cache.json           ★ 일별 활동 통계 (이미 집계됨!)
statsig/                   feature flag
tasks/                     백그라운드 task
telemetry/                 텔레메트리 큐
todos/                     todo 상태
transcripts/               (오래된) 트랜스크립트
usage-data/                ★ session-meta 별 메타데이터
```

★ = HAETAE 와 직접 관련.

### `~/.claude/settings.json` (글로벌 설정)

```json
{
  "permissions": { "allow": ["mcp__pencil"] },
  "model": "opus[1m]",
  "effortLevel": "high",
  "theme": "light-daltonized",
  "remoteControlAtStartup": false,
  "agentPushNotifEnabled": true
}
```

→ 모델 / effort 등은 있는데 **구독 등급은 없음**.

### `~/.claude/sessions/<pid>.json` (in-process)

```bash
$ cat ~/.claude/sessions/37770.json
{"pid":37770,"sessionId":"...","cwd":"...","startedAt":1777786745373,
 "procStart":"Sun May  3 05:39:04 2026","version":"2.1.126","peerProtocol":1,
 "kind":"interactive","entrypoint":"cli","name":"...","updatedAt":...,
 "status":"idle"}
```

→ \"지금 실행중인 claude 인스턴스\" 의 메타. 동시 실행 감지나 \"마지막
실행 시각\" 에는 쓸만하지만 **구독 / 한도 정보는 없음**.

### `~/.claude/stats-cache.json` (일별 집계 — 무료 보너스)

```bash
$ cat ~/.claude/stats-cache.json
{
  "version": 3,
  "lastComputedDate": "2026-05-01",
  "dailyActivity": [
    { "date": "2026-03-19", "messageCount": 5167, "sessionCount": 5, "toolCallCount": 956 },
    { "date": "2026-03-20", "messageCount": 1301, "sessionCount": 2, "toolCallCount": 167 },
    ...
  ]
}
```

→ Claude Code 가 **이미 일별로 집계해놓은** 데이터. 우리가 jsonl
파싱으로 만든 by-day 와 별개로 \"messageCount / toolCallCount\" 같은
지표가 들어있어 보완 정보로 쓸 수 있음.

### `~/.claude/usage-data/session-meta/<sessionId>.json` (세션 메타)

```bash
$ cat ~/.claude/usage-data/session-meta/9ee9ef3c-....json
{
  "session_id": "9ee9ef3c-...",
  "project_path": "/Users/me/Documents/GitHub/some-project",
  "start_time": "2026-03-16T03:20:08.372Z",
  "duration_minutes": 0,
  "user_message_count": 1,
  "assistant_message_count": 1,
  "tool_counts": {},
  "languages": {},
  "git_commits": 0,
  "git_pushes": 0,
  "input_tokens": 0,
  "output_tokens": 0,
  "first_prompt": "2번항목 평가해봐",          ← 첫 메시지 프리뷰
  "user_interruptions": 0,
  "user_response_times": [],
  "tool_errors": 0,
  ...
}
```

→ #142 의 session drill-down 헤더가 활용하기 좋음 (\"첫 질문 미리보기\",
\"실제 대화 시간\", \"git commit 수\" 등). HAETAE 가 jsonl 다시 파싱
안 해도 이미 계산되어있는 값들.

---

## 2. macOS Keychain — OAuth access token

```bash
$ security find-generic-password -s 'Claude Code-credentials' -w
{"claudeAiOauth":{"accessToken":"sk-ant-oat01-REDACTED","...":"..."}}
```

- Pro / Max 구독자는 API key 가 아니라 **OAuth access token** 으로
  Anthropic 과 통신함 (`sk-ant-oat01-…` prefix).
- 이 토큰을 들고 `https://api.anthropic.com/v1/me/usage` 같은 비공개
  엔드포인트를 때리면 \*\*아마도\*\* 한도 정보가 나올 것이다 (확정은 안
  해봄 — 본 연구에서는 호출 안 함).
- 비공개 endpoint 의존은 한 번 schema 바뀌면 무음 깨짐 + ToS 회색
  지대. \"opt-in 실험\" 외에는 권하지 않는 길.

---

## 3. `claude` CLI 가 직접 노출하는 데이터

### `claude auth status --json` ★ — 즉시 사용 가능

```bash
$ claude auth status --json
{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "email": "user@example.com",
  "orgId": "a9797a79-...",
  "orgName": "user@example.com's Organization",
  "subscriptionType": "pro"
}
```

→ \"내가 무엇을 구독중인지\" 의 **정답**. 추가 의존성 0, 안정성 높음.
HAETAE 서버가 child_process 로 호출 후 캐시 (예: 30분) 하면 됨.

### `claude --print --output-format json '/cost'` 등 — 작동 안 함

```bash
$ claude --print --output-format json '/cost'
{"result":"You are currently using your subscription to power your Claude Code usage", ...}
```

```bash
$ claude --print --output-format json '/usage'
{"result":"You are currently using your subscription to power your Claude Code usage", ...}
```

```bash
$ claude --print --output-format json '/config'
{"result":"/config isn't available in this environment.", ...}
```

→ slash command 들은 **interactive TUI 안에서만** 한도 / 잔량을 그
린다. `--print` 모드에서는 placeholder 문자열만 돌아옴.

### 사용 가능한 top-level subcommand

```bash
$ claude --help | grep '^  [a-z]'
agents       Manage background and configured agents
auth         Manage authentication        ← status --json 으로 구독 정보
auto-mode    Inspect auto mode classifier
doctor       updater health check
install      installer
mcp          MCP servers
project      project state (purge 등)
ultrareview  cloud multi-agent review
```

→ 한도 / 윈도우 데이터를 노출하는 subcommand 는 없음.

### 바이너리 strings 확인

```bash
$ strings $(which claude) | grep -iE 'rate.*limit|quota|usage_remain|five.*hour'
```

→ 컴파일된 Rust 바이너리. regex/automata 의 internal string 들만 잡힘.
한도 관련 endpoint URL 이 평문으로 노출되지 않음 (당연히).

---

## 4. 옵션 비교 (한도 / 잔량 표시 방안)

| 옵션 | 데이터 정확도 | 안정성 | 작업량 | 위험 |
|---|---|---|---|---|
| **A. Keychain OAuth → 비공개 `/v1/me/usage`** | 진짜 한도 % | 낮음 (스펙 비공개, 무음 깨짐) | 중 | ToS 회색지대 |
| **B. jsonl 합산 → 최근 5h / 7d 누적** | 절대 토큰/비용 정확. % 는 사용자가 입력한 임계치 (#141) 와 비교 | 높음 (우리 데이터) | 작음 | 한도 자체는 모름 |
| **C. `claude /usage` TUI 출력 PTY 스크레이프** | 진짜 한도 | 매우 낮음 (ANSI 박스/색 파싱) | 큼 | TUI 마이너 업데이트마다 깨짐 |

기본 권고: **B + 구독 등급 표시** 부터.
- 구독 등급 (`auth status --json`) 으로 \"PRO\" 가 사이드바/Profile 에
  뜸 → \"내가 뭘 구독중인지\" 질문은 즉시 해결.
- jsonl 누적 5h / 7d 가 \"내가 얼마나 썼는지\" 를 절대치로 답함.
- 사용자가 본인 한도를 추정해 #141 의 daily/monthly 임계치에 입력
  하면 OVER 배지가 자연스럽게 \"한도 임박\" 알림 역할.

A 는 보류. 정말 진짜 한도 % 가 필요하면 별도 \"실험 (opt-in)\" 으로
flag 걸고 진행. 깨질 수 있다는 걸 UI 에 명시.

---

## 5. 검증한 환경

- macOS Darwin 25.4.0
- `claude` v2.1.126
- 구독: Pro (`subscriptionType: "pro"`)
- HAETAE: post-Phase 6 main (커밋 #143 시점)

다른 구독 등급에서 위 경로/출력이 동일한지는 미확인.

**OAuth 자격증명 저장 위치 (3 platform):**
- macOS: 시스템 Keychain 항목 `Claude Code-credentials` (위 `security` 명령).
- Linux / Windows: `~/.claude/.credentials.json` 평문 파일(mode 0600), `$CLAUDE_CONFIG_DIR` 설정 시 그 아래. secret-tool / Credential Manager 가 **아님** (메인 OAuth 자격증명 기준; 플러그인 자격증명은 별도).
- 세 경로 모두 동일한 `{"claudeAiOauth":{accessToken,refreshToken,expiresAt,...}}` JSON. `keychain.ts` 가 platform 분기로 모두 처리.
- ⚠️ Linux/Windows 파일 경로는 공개 문서/사례 기반으로 확인 — 실 OS 런타임 검증은 미수행(해당 머신 부재).

---

## 5.5. 옵션 A 검증 결과 (#154)

\`claude --debug --debug-file=/tmp/cc-config-capture.log\` 로 interactive
TUI 띄우고 \`/config\` Usage 탭을 눌렀을 때 잡힌 endpoint:

```
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer sk-ant-oat01-...           ← Keychain OAuth
anthropic-beta: oauth-2025-04-20                 ← 없으면 401
```

응답 (Pro 사용자, 2026-05-04 기준):

```json
{
  "five_hour": { "utilization": 5.0, "resets_at": "2026-05-04T02:20:00...+00:00" },
  "seven_day": { "utilization": 71.0, "resets_at": "2026-05-04T07:00:00...+00:00" },
  "seven_day_oauth_apps": null,
  "seven_day_opus": null,
  "seven_day_sonnet": { "utilization": 0.0, "resets_at": null },
  "seven_day_cowork": null,
  "seven_day_omelette": { "utilization": 0.0, "resets_at": null },
  "tangelo": null,
  "iguana_necktie": null,
  "omelette_promotional": null,
  "extra_usage": {
    "is_enabled": true, "monthly_limit": 0, "used_credits": 0.0,
    "utilization": null, "currency": "USD"
  }
}
```

- \`utilization\` 단위: 0~100 (이미 percent)
- \`resets_at\`: ISO timestamp, null 가능
- \`tangelo\` / \`iguana_necktie\` / \`omelette_promotional\` 같은 코드네임
  필드는 실험중인 한도 종류로 추정. 우리는 \`five_hour\` 와 \`seven_day\`
  두 개만 사용하고 나머지는 zod \`.passthrough()\` 로 무시.

**주의**: 이 endpoint 는 비공개. CLI 내부 구현 디테일이라 schema 가 공
지 없이 바뀔 수 있음. HAETAE 는 zod 검증 실패 = \`null\` 반환으로 무
음 fallback. UI 에 \"limit · claude /config\" / \"limit · Settings 임계치\"
배지로 어느 source 를 쓰는지 노출.

### opt-in 정책 (#161)

오픈소스 공개 시 수백 명의 사용자가 동시에 같은 비공개 endpoint 를 두
드리면 Anthropic 이 (a) 봉쇄, (b) 항의, (c) 못 본 척 — 셋 중 어디로
갈지 모름. 책임 분리를 위해 **기본 비활성** + **명시적 opt-in flag**:

\`\`\`
# apps/server/.env.local
HAETAE_USE_OAUTH_LIMITS=true
\`\`\`

\`readUsageLimits()\` 의 첫 줄에서 \`process.env.HAETAE_USE_OAUTH_LIMITS\`
가 \`\"true\"\` 가 아니면 즉시 \`null\` → UI 가 자동으로 Settings 임계치
(#141 / #153) fallback 으로 동작. 즉 endpoint 를 의식적으로 켜지 않은
사용자는 호출 자체가 발생하지 않음.

## 6. 후속 작업 후보 (이 문서에서 곧장 도출되는 것)

1. **구독 표시**: 서버에 `GET /api/system/auth-status` (child_process
   `claude auth status --json`, 30분 캐시) → 사이드바 하단 또는
   Profile 에 \"PRO · email\" 줄.
2. **세션 메타 통합**: `~/.claude/usage-data/session-meta/<id>.json` 을
   #142 의 detail 응답에 합쳐 \"첫 질문 / 실제 대화 시간 / git commit
   수\" 표시.
3. **5h / 7d 누적 패널**: jsonl 합산 → Watching/Overview 상단 KPI 옆
   에 \"최근 5시간\", \"이번 주\" 칸 추가. #141 의 임계치와 연결.
4. **(옵션) 실험 모드 — Keychain OAuth 사용량 endpoint**: 별도 ADR
   필요. 깨질 가능성 명시.

각각 별도 PR.
