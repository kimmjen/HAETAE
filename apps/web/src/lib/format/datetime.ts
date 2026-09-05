import dayjs from "@/lib/dayjs";

/**
 * Compact relative-time string for short UI labels — "5m ago", "2h ago",
 * "3d ago". Anchored to "now" at the call site so the value updates
 * naturally on re-render.
 */
export function formatRelativeTime(tsMs: number, nowMs: number = Date.now()): string {
  const d = dayjs(tsMs);
  const now = dayjs(nowMs);
  const diffMs = now.diff(d);
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);

  if (abs < 60_000) return future ? "in <1m" : "just now";
  const mins = Math.floor(abs / 60_000);
  if (abs < 3_600_000) return future ? `in ${mins}m` : `${mins}m ago`;
  const hrs = Math.floor(abs / 3_600_000);
  if (abs < 86_400_000) return future ? `in ${hrs}h` : `${hrs}h ago`;
  const days = Math.floor(abs / 86_400_000);
  return future ? `in ${days}d` : `${days}d ago`;
}

/**
 * "YYYY-MM-DD HH:mm:ss" in local time.
 */
export function formatLocalTimestamp(tsMs: number): string {
  return dayjs(tsMs).format("YYYY-MM-DD HH:mm:ss");
}
