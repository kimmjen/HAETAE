# 미확정 결정

시점 도달 시 옵션 비교 → 합의 → 새 ADR 로 승격.

> 기획 (Phase 0~6) 단계에서 사실상 결정된 항목은 본문 아래 **"확정된 결정 (ADR 미작성)"** 으로 별도 정리. 진짜 미정인 항목만 위쪽에 둠.

## Tauri → 확정 ([ADR 0012](./0012-tauri-desktop.md))

Tauri 셸 + Node 사이드카로 확정(2026-06-09). `apps/desktop`. v1 = `tauri dev` 자체기동,
v2 = 번들 standalone. Node 자산은 재작성 없이 보존.

## ESLint / Biome

**시점**: 필요 시 (현재는 `tsc --noEmit` 만)

| 옵션 | 평가 |
|---|---|
| 현재 (lint 없음) | 작은 코드베이스 동안 OK |
| ESLint + 플러그인 | 표준이나 설정 무거움 |
| Biome | Rust 기반, 빠름, 단일 도구 |

## E2E 테스트

**시점**: 미정 (Phase 4~6 의 단위 + 통합 테스트로 현재는 충족)

| 옵션 | 평가 |
|---|---|
| Playwright | 표준, web 인터랙션 |
| Cypress | UI 좋으나 본 프로젝트는 작음 |

특히 Tauri 가면 native window 단축키 (`Cmd+T` 등) 가 단위 테스트로 잡히지 않으므로 Playwright 가 가치 커짐.

## 빌드 산출물 영속 실행

**시점**: 일상 사용 패턴 정립 시 (현재는 `scripts/launch.sh` 로 충분)

- `pnpm dev` 매번 띄우는 게 부담스러우면
- macOS launchd / Linux systemd 로 백그라운드 실행 등록
- 또는 Tauri 앱화 (위 Tauri 결정과 묶임)

---

# 확정된 결정 (ADR 미작성)

기획 진행 중에 자연스럽게 결정되었으나 별도 ADR 로 승격 안 한 항목들. 추후 정리할 때 ADR 로 옮길 수 있음.

| 결정 | 시점 | 결과 |
|---|---|---|
| **PTY 라이브러리** | Phase 3 P3.1 (#80) | `node-pty` 채택. macOS arm64 prebuild 안정적이라 시작. spawn-helper 권한 자동 fix (#94) 후 안정 |
| **`Cmd+K` 단축키 충돌** | Phase 3 P3.4 (#89) | xterm 포커스 시에만 터미널 clear, 그 외엔 명령 팔레트. `useHotkey({enabled})` + `useXtermFocus` 로 양쪽 배타 활성 |
| **폰트** | Phase 0 부터 | Inter (영문) + JetBrains Mono (코드). 한글은 시스템 fallback. 사용자 선호 명시 시 Pretendard 로 전환 가능 |
| **Bloomberg 톤 ANSI** | Phase 3 직전 | ADR 0008 — 단일 팔레트, light/dark 동일 픽셀 |
| **UI 라이브러리** | Phase 1 → 2 사이 | ADR 0006 — 직접 작성 (Radix Dialog 등 primitives 만 차용) |
| **Rules 카테고리** | Phase 2 P2.7a | ADR 0007 — rules / skills / agents / commands |
| **CI (GitHub Actions)** | OSS 공개 준비 (#162) | `.github/workflows/ci.yml` — ubuntu + macos 매트릭스, push (main/dev) + 모든 PR 에서 `pnpm install --frozen-lockfile && pnpm lint && pnpm test`. Windows 는 node-pty 빌드 이슈로 추후 |
| **가격 테이블 자동 갱신** | #167 (#196) | 월 1회 GitHub Actions cron 이 reminder 이슈 자동 생성 (scrape 안 함). `.github/workflows/pricing-reminder.yml`. 메인테이너가 Anthropic 공식 페이지와 직접 대조 — HTML scrape 깨질 비용보다 사람 확인이 단순/안전 |
