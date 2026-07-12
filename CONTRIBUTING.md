# Contributing to Haetae

Haetae 는 단일 사용자 로컬 도구로 시작했지만 외부 컨트리뷰션을 환영합니다. 이 문서는 PR 을 보낼 때 따라야 할 최소 컨벤션입니다.

## 시작 전

1. 큰 작업이라면 먼저 [issue 에서 논의](https://github.com/kimmjen/HAETAE/issues) — \"오해와 헛수고 방지\"
2. 이미 비슷한 작업이 있는지 [열린 PR](https://github.com/kimmjen/HAETAE/pulls) 확인
3. macOS 외 환경에서 작업 가능 — CI 가 ubuntu + macOS 두 매트릭스로 검증

## 워크플로우

```
Issue → Branch → Conventional commit → PR → squash merge
```

- 모든 PR 은 `dev` 를 base 로. `main` 은 메인테이너 개인 사용 브랜치라 직접 변경 금지
- 브랜치 이름: `feat/<short>`, `fix/<short>`, `chore/<short>`, `docs/<short>`, `ci/<short>` 중 하나
- commit message: [Conventional Commits](https://www.conventionalcommits.org/) 권장 (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`)
- PR title 에 관련 issue 번호 (`(#N)`) 포함

## 코드 컨벤션

다음은 메인테이너의 \"실제로 PR 거절 사유가 되는\" 항목들 — 의식적으로 따라주세요.

### 디자인 토큰 (UI 작업 시)
- **임의 hex / rgb 직접 사용 금지** — 모든 색은 `var(--color-*)` 또는 Tailwind 의 `bg-bg-*` / `text-text-*` 같은 semantic 토큰만
- 3-tier 구조: primitive → semantic → component

### 컴포넌트화
- 페이지 안에 인라인 JSX 가 30 줄 넘어가면 별도 컴포넌트로
- 반복되는 의미 단위 (예: 같은 카드 모양이 두 번 이상) 는 무조건 분리

### 포맷팅 유틸
- 토큰 수 / 시간 / USD / 바이트 등 모든 단위 표기는 `lib/format/` 의 함수 거치기
- 인라인 \`${num.toFixed(2)}\` 같은 거 금지

### Native dialogs 금지
- `window.alert / confirm / prompt` 절대 사용 금지
- 확인 다이얼로그는 `ConfirmDialog`, 일회성 알림은 `sonner` toast

### 비주얼 스타일
- **이모지 / CSS 그라데이션 사용 금지** — UI / 문서 / commit 메시지 어디에도

### 테스트
- 새 기능에는 단위 테스트 동반 — vitest
- 새 PR 은 기존 테스트 모두 통과 필수 (CI 가 강제)

### Co-Authored-By 등 attribution 라인
- commit message 에 \`Co-Authored-By\`, \`Generated with\` 등 attribution 라인 일체 추가 금지

## PR 보내기

1. fork → 본인 브랜치
2. 위 컨벤션 따라 변경
3. **로컬에서 검증**:
   ```bash
   pnpm lint
   pnpm test
   ```
4. PR open — base = `dev`, head = `<your-fork>:<branch>`
5. PR template 에 \`## Summary\` + \`## Test plan\` 채우기
6. CI green 대기 → 메인테이너 리뷰
7. 머지 시 squash 됩니다

## 보안 신고

보안 이슈는 GitHub Issue 가 아니라 [`SECURITY.md`](./SECURITY.md) 의 채널로.

## 라이선스

기여하시는 모든 코드는 [MIT 라이선스](./LICENSE) 로 배포됩니다.
