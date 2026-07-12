# Security Policy

## 신고 채널

보안 이슈는 **public GitHub Issue 로 등록하지 마세요.** 대신:

- [GitHub Security Advisory](https://github.com/kimmjen/HAETAE/security/advisories/new) 로 비공개 신고
- 또는 메인테이너에게 직접 연락

신고 후 영업일 기준 7일 내 1차 응답을 목표로 합니다.

## 알려진 보안 모델

Haetae 는 **단일 사용자 / 같은 머신** 환경 전용입니다:

- 서버는 `127.0.0.1` 만 바인딩 — 같은 네트워크 다른 사용자가 접근할 수 없음
- 인증 / 멀티유저 / 외부 host 일체 없음
- 사용자 데이터 (`~/.claude/`) 접근은 화이트리스트 경로만 허용
- 비밀 (`ANTHROPIC_ADMIN_KEY` 등) 은 `apps/server/.env.local` 에만 — 클라이언트 번들 미포함 (`VITE_` prefix 금지)

## 비공식 endpoint 의존성

기본 비활성이지만 사용자가 명시적으로 켤 수 있는 기능:

- `HAETAE_USE_OAUTH_LIMITS=true` 시 macOS Keychain 의 OAuth 토큰을 읽어 비공개 endpoint `https://api.anthropic.com/api/oauth/usage` 호출
- 이 토큰은 **사용자의 claude.ai 세션 자격 증명** — Haetae 외부로 전송되지 않으나, 코드가 Keychain 을 읽는다는 사실은 명확히 인지 필요
- 자세한 근거: [`docs/research/claude-code-data-sources.md`](./docs/research/claude-code-data-sources.md)

opt-in 정책으로 책임 분리되어있지만, 토큰 노출 / 잘못된 사용 사례 발견 시 위 채널로 신고해주세요.

## 지원 범위

- `dev` 브랜치 = 오픈소스 활성 개발 라인 — 보안 fix 항상 우선
- `main` 브랜치 = 메인테이너 개인 사용 — 외부 보안 신고 대상 아님
- 태그된 릴리즈 없음 (현 시점) — 보안 fix 는 `dev` 머지 시점이 \"릴리즈\"
