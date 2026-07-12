# 개발 워크플로우

## Git 풀 사이클

`Issue → Branch → Commit → PR → Merge`. main 직접 커밋 금지.

브랜치 명명: `<type>/<issue-num>-<short-desc>`
- `feat/N-...`, `fix/N-...`, `chore/N-...`, `docs/N-...`, `refactor/N-...`, `test/N-...`

## 커밋 컨벤션

Conventional Commits. 본문에 "왜" 를 1~3문장.

```
<type>(<scope>): <subject>

<body — why, not what>

Closes #N
```

### 금지 사항

- `Co-Authored-By: Claude` 등 attribution 라인
- "Generated with Claude Code" 등 자동 서명
- 이모지 (커밋 메시지 포함)

## PR

- 제목 ~70자
- 본문: Summary / Test plan / Out of scope
- Issue 연결 (`Closes #N`)
- 머지: squash 권장
- 머지 후 브랜치 삭제 + main pull

## 코드 컨벤션

| 영역 | 규칙 |
|---|---|
| 색상 | 디자인 토큰만 사용. raw `bg-black`, `text-gray-500`, `bg-[#fff]` 등 금지 |
| 단위 표기 | `lib/format/` 유틸 거쳐서 사용 |
| JSX | 페이지 인라인 JSX 금지. 의미·반복 단위는 컴포넌트 분리 |
| 인터랙티브 요소 | `<button>` 사용. clickable `<div>` 금지 |
| 주석 | "왜" 만. "무엇" 은 식별자로 표현 |
| 이모지 | 어디에도 사용 금지 (UI / 문서 / 커밋) |
| 그라데이션 | CSS gradient 금지 |
| native module | `pnpm-workspace.yaml` 의 `allowBuilds` 에 명시 |

## PR 머지 전 체크리스트

- [ ] `pnpm lint` (`tsc --noEmit`) 0 에러
- [ ] `pnpm test` 양 패키지 통과
- [ ] `pnpm build` 양 패키지 성공
- [ ] `pnpm dev` 정상 기동 (web :5173, server :3001)
- [ ] 다크/라이트 모드 전환 시 UI 깨짐 없음
- [ ] 키보드만으로 주요 작업 가능 (focus-visible 표시)
- [ ] raw 색상 사용 0개 (`grep -rn "bg-black\|text-gray-" apps/web/src/` 결과 없음)
- [ ] 새 머신 가정 setup 시퀀스 통과
- [ ] 서버 `127.0.0.1` 바인딩 확인 (`lsof -iTCP:3001 -sTCP:LISTEN`)
- [ ] Admin Key `VITE_` prefix 미사용 확인
- [ ] Conventional commit + attribution 없음 + 이모지 없음
- [ ] 변경된 동작에 테스트 추가됨

## 새 결정이 생기면

새로운 기술 선택 / 아키텍처 결정이 필요하면:
1. 옵션 비교 + trade-off 정리
2. 합의된 결정은 새 ADR 파일 추가 (`docs/decisions/000N-<slug>.md`)
3. [decisions/README.md](./decisions/README.md) 인덱스 갱신
4. 미결정 상태면 [pending.md](./decisions/pending.md) 에 추가

## 결정 확정 시 체크리스트

이전에 [pending.md](./decisions/pending.md) 에 있던 항목이 확정되면 4곳을 모두 갱신해야 drift 가 없음:

- [ ] 새 ADR 파일 작성 (`docs/decisions/000N-<slug>.md`) — Context / Decision / Consequences / Alternatives 형식
- [ ] [decisions/README.md](./decisions/README.md) 의 "확정" 표에 추가
- [ ] [decisions/pending.md](./decisions/pending.md) 에서 해당 항목 제거
- [ ] [stack.md](./stack.md) 의 "미확정" 표에서 제거 + (필요 시) "확정" 영역에 라이브러리 추가

추가로:
- 해당 결정이 코드 변경을 동반하면 같은 PR 안에 코드 + 문서 변경
- 결정만 먼저 확정하고 코드는 후속 PR 일 경우, ADR 의 Status 는 `Accepted` (코드 미적용 상태에서도 결정은 유효)

## 문서 갱신 의무

다음 변경은 문서를 함께 갱신:
- 머지된 PR → [status.md](./status.md) 의 PR 표 + 진행도
- 결정 확정 → 새 ADR + `pending.md` 에서 제거
- 새 의존성 → [stack.md](./stack.md)
- 디자인 토큰 변경 → [design-system.md](./design-system.md)
- Phase 진입 → [roadmap.md](./roadmap.md) 단계 표시
