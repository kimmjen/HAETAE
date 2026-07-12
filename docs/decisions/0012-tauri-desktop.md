# ADR 0012 — 데스크톱 = Tauri (셸 + Node 사이드카)

Status: Accepted
Date: 2026-06-09

## Context

P6.3은 "(선택) Tauri 패키징"을 보류 ADR로 두고 일상 사용 패턴 확정 후 결정하기로 했다
(pending.md의 "Tauri Yes/No"). 매번 `npm run dev`/`pnpm start`로 띄우는 마찰(포트 충돌
포함)이 누적돼, 네이티브 앱화를 진행하기로 한다.

핵심 제약: HAETAE 백엔드는 Node(better-sqlite3·node-pty·`claude` CLI·macOS Keychain).
Tauri 백엔드는 Rust. 재작성은 비현실적(ADR 0010이 Node 네이티브 자산 보존을 택한 것과 동일
논리). 또 Electron은 메인 프로세스가 Node라 더 쉽지만 무겁고, 사용자가 Tauri를 선호.

개인 자기사용이므로 코드사이닝·공증·단일바이너리(SEA)는 불필요(배포 개념만의 난관).

## Decision

**Tauri 셸 + Node 서버(사이드카) 경로.** `apps/desktop`(Tauri 2). 재작성 없음.

- **v0**: 창이 `127.0.0.1:3001`(prod 서버 web+api 단일 오리진) 로드. 셸·툴체인 검증.
- **v1**: `tauri dev`가 `beforeDevCommand`로 web(Vite :5173)+server(:3001) 자동 기동,
  종료 시 함께 내림. 명령 하나로 전 스택. (핵심: `tauri dev`는 devUrl 준비를 Rust 앱
  실행 *전에* 기다리므로 서버를 Rust setup에서 spawn하면 늦음 → dev 자체기동은
  beforeDevCommand가 정답.)
- **v2 (예정)**: 번들 standalone `.app` — Rust `externalBin`/resources로 번들된 Node
  서버 spawn(node_modules + prebuilt 네이티브 애드온 동봉, GUI는 셸 PATH 미상속이라 node
  명시 resolve) → `.dmg` + 크로스플랫폼 keychain(libsecret/Credential Manager).

CI 영향 없음: `apps/desktop`은 lint/test 스크립트 없어 `pnpm --recursive` skip(Rust는
CI 빌드 안 함).

## Consequences

### 긍정
- Node 네이티브 자산(터미널·인덱서·claude subprocess) 보존, 무위험.
- v1로 일상 마찰(수동 서버 기동) 제거. 더블클릭 앱(v2)으로 가는 토대.

### 부정 / 비용
- v2 번들이 진짜 난관(네이티브 애드온 동봉·GUI PATH). 단계적으로 분리.
- Rust 툴체인 의존(cargo). 새 머신 setup에 추가 필요.
