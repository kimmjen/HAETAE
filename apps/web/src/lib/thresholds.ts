/**
 * Per-user cost thresholds (5h / daily / weekly / monthly USD).
 *
 * Local-only tool, single user → localStorage is fine. We expose a
 * tiny pub/sub on top of `storage` events + a custom event so that
 * components reading the same key (Sidebar badge, Settings input,
 * Windows panel progress bars) stay in sync without React Query plumbing.
 *
 * 4-tier matches the rolling windows in #147 — Pro/Max 한도 윈도우가
 * 5시간 단위인데 한도 자체는 CLI 가 안 알려줘서 사용자가 직접 입력.
 */

const KEY_5H = "haetae:threshold-5h-usd";
const KEY_DAILY = "haetae:threshold-daily-usd";
const KEY_WEEKLY = "haetae:threshold-weekly-usd";
const KEY_MONTHLY = "haetae:threshold-monthly-usd";
const EVENT = "haetae:thresholds-changed";

export interface Thresholds {
  fiveHourUsd: number | null;
  dailyUsd: number | null;
  weeklyUsd: number | null;
  monthlyUsd: number | null;
}

function readNumber(key: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (raw === null || raw === "") return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getThresholds(): Thresholds {
  return {
    fiveHourUsd: readNumber(KEY_5H),
    dailyUsd: readNumber(KEY_DAILY),
    weeklyUsd: readNumber(KEY_WEEKLY),
    monthlyUsd: readNumber(KEY_MONTHLY),
  };
}

export function setThresholds(next: Partial<Thresholds>): void {
  if (typeof window === "undefined") return;
  const apply = (key: string, value: number | null | undefined) => {
    if (value === undefined) return;
    if (value === null || !Number.isFinite(value) || value <= 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, String(value));
    }
  };
  apply(KEY_5H, next.fiveHourUsd);
  apply(KEY_DAILY, next.dailyUsd);
  apply(KEY_WEEKLY, next.weeklyUsd);
  apply(KEY_MONTHLY, next.monthlyUsd);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeThresholds(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === KEY_5H ||
      e.key === KEY_DAILY ||
      e.key === KEY_WEEKLY ||
      e.key === KEY_MONTHLY
    ) {
      listener();
    }
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
