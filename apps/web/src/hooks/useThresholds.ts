import { useSyncExternalStore } from "react";
import {
  getThresholds,
  subscribeThresholds,
  type Thresholds,
} from "@/lib/thresholds";
import { useUsageWindows } from "./useUsageLocal";

const empty: Thresholds = {
  fiveHourUsd: null,
  dailyUsd: null,
  weeklyUsd: null,
  monthlyUsd: null,
};

let cached: Thresholds = empty;
let initialized = false;

/**
 * useSyncExternalStore caches by reference equality, so we MUST return
 * the same object until something changes. We refresh `cached` only
 * when `subscribeThresholds` fires (or on first call).
 */
function snapshot(): Thresholds {
  if (typeof window === "undefined") return empty;
  if (!initialized) {
    cached = getThresholds();
    initialized = true;
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  return subscribeThresholds(() => {
    cached = getThresholds();
    listener();
  });
}

export function useThresholds(): Thresholds {
  return useSyncExternalStore(subscribe, snapshot, () => empty);
}

export interface ThresholdStatus {
  thresholds: Thresholds;
  /** Live per-window spend (USD). */
  fiveHourUsd: number;
  todayUsd: number;
  weekUsd: number;
  monthUsd: number;
  fiveHourOver: boolean;
  dailyOver: boolean;
  weeklyOver: boolean;
  monthlyOver: boolean;
  /** True if any of the four windows is over its limit. */
  anyOver: boolean;
}

/**
 * Combines the persisted cost limits with live rolling-window totals so
 * any consumer (Sidebar badge, Settings panel, Windows panel progress
 * bars) reads a single coherent status.
 */
export function useThresholdStatus(): ThresholdStatus {
  const thresholds = useThresholds();
  const windows = useUsageWindows();

  const w = windows.data?.data?.windows;
  const fiveHourUsd = w?.last5h.costUsd ?? 0;
  const todayUsd = w?.last24h.costUsd ?? 0;
  const weekUsd = w?.last7d.costUsd ?? 0;
  const monthUsd = w?.monthToDate.costUsd ?? 0;

  const over = (limit: number | null, spent: number) =>
    limit !== null && spent >= limit;

  const fiveHourOver = over(thresholds.fiveHourUsd, fiveHourUsd);
  const dailyOver = over(thresholds.dailyUsd, todayUsd);
  const weeklyOver = over(thresholds.weeklyUsd, weekUsd);
  const monthlyOver = over(thresholds.monthlyUsd, monthUsd);

  return {
    thresholds,
    fiveHourUsd,
    todayUsd,
    weekUsd,
    monthUsd,
    fiveHourOver,
    dailyOver,
    weeklyOver,
    monthlyOver,
    anyOver: fiveHourOver || dailyOver || weeklyOver || monthlyOver,
  };
}
