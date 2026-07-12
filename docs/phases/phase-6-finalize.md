# Phase 6 — 마감

## 컨셉

Phase 1~5 까지가 데이터 확보 + 표시였다면, Phase 6 는 그 데이터에서 **사용자가 행동으로 옮길 만한 인사이트를 끌어내는** 단계. 새 데이터 소스를 추가하지 않고, 이미 있는 `usage_events` / `usage_api_events` 위에 두 가지 뷰를 더한다.

1. **캐시 효율 인사이트** — 어디서 cache hit / miss 가 나는지, 그게 비용으로 얼마인지
2. **시간대 히트맵 고도화** — 현재 cost-intensity grid 에 더해 productive hours 비교 / 평균 lane

(선택) Tauri 데스크톱 패키징은 별도 결정 (ADR pending) 에 묶임 — 명세에 포함하되 진행은 사용자 결정 시.

## 단계

| 단계 | 산출물 | 검증 |
|---|---|---|
| P6.1 | `routes/usage-local/insights` (cache 효율) + UI 패널 (Local Usage 페이지 안) | hit ratio · cache savings $ · top miss models |
| P6.2 | `UsageHeatmap` v2 — 평균 lane, productive-hour 강조, weekday/weekend toggle | Bloomberg 톤 유지, 기존 7×24 grid 컴포넌트 확장 |
| P6.3 | (선택) Tauri 패키징 — pending decision 확정 시 | macOS dmg / Windows exe 빌드 + native window 단축키 검증 |

## P6.1 — 캐시 효율 인사이트

### 무엇을 보여주나

- **Cache hit ratio**: `cache_read / (input + cache_read + cache_creation)`. 100% 에 가까울수록 같은 prompt 가 반복돼서 캐시가 잘 통한다는 뜻.
- **Cache savings**: `cache_read_tokens × (input_rate − cache_read_rate)` 모델별 합산. "캐시 덕에 얼마 아꼈나" 한 줄 KPI.
- **Top cache-miss models**: 캐시 hit ratio 가 낮은 모델 / 프로젝트 (개선 여지).

### 데이터 소스

`usage_events` 그대로. 새 endpoint 하나:

```
GET /api/usage/local/insights?days=30
→ {
    data: {
      hitRatio: number,           // 0..1
      cacheSavingsUsd: number,
      perModel: Array<{
        model: string,
        hitRatio: number,
        savingsUsd: number,
      }>,
      perProject: Array<{
        projectPath: string,
        label: string,
        hitRatio: number,
        savingsUsd: number,
      }>,
    },
    meta: { generatedAt, totalEvents },
  }
```

savings 계산은 `services/usage/pricing.ts` 의 rate 사용 — 모델 family 별 (input_rate - cache_read_rate) × cache_read_tokens.

### UI

`LocalUsageView` 페이지에 새 카드 섹션 추가 — 기존 차트 위에 한 줄 KPI + 모델별 mini 표.

## P6.2 — 히트맵 고도화

기존 `UsageHeatmap` 은 cost intensity 만. 추가:

- **평균 lane** — 각 hour 의 평균 cost 를 grid 위쪽에 작은 sparkline 으로
- **Productive hours** — top 5 hours by cost 를 강조 색 (accent strong)
- **Weekday / weekend toggle** — 평균 패턴 차이 명시

Recharts 안 쓰고 기존 CSS table 확장 — 이미 168 셀 grid 라 가벼움 유지.

## P6.3 — (선택) Tauri 패키징

ADR pending (Tauri Yes/No) 가 확정되면 진행. 명세는 phases/phase-6-finalize.md 에 stub 만 두고, 본 작업은 별도 phase 또는 ADR commit 시 trigger.

## 결정 (Phase 6 진행 중 확정)

- cache savings 계산에 unknown model 가격 0 vs Sonnet 기본값 가정 — 현재 0
- Tauri 결정 시점 (Phase 6 끝 vs 별도)
