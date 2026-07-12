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

/**
 * Countdown-style reset label — within 24h: "resets in 3h 25m"
 * beyond 24h: "resets Sun 4:00 PM" / parse failure: ""
 */
export function formatResetCountdown(
  isoOrMs: string | number | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (isoOrMs === null || isoOrMs === undefined) return "";
  const ms = typeof isoOrMs === "string" ? dayjs(isoOrMs).valueOf() : isoOrMs;
  if (!Number.isFinite(ms) || ms <= nowMs) return "";

  const target = dayjs(ms);
  const now = dayjs(nowMs);
  const diff = target.diff(now);

  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h > 0 && m > 0) return `resets in ${h}h ${m}m`;
    if (h > 0) return `resets in ${h}h`;
    return `resets in ${m}m`;
  }

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dow = DOW[target.day()] ?? "";
  const h = target.hour();
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const m = String(target.minute()).padStart(2, "0");
  return `resets ${dow} ${h12}:${m} ${period}`;
}

export function formatResetTime(
  isoOrMs: string | number | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (isoOrMs === null || isoOrMs === undefined) return "";
  const ms = typeof isoOrMs === "string" ? dayjs(isoOrMs).valueOf() : isoOrMs;
  if (!Number.isFinite(ms)) return "";

  const target = dayjs(ms);
  const now = dayjs(nowMs);
  const hhmm = target.format("HH:mm");
  const sameDay = target.isSame(now, "day");

  if (sameDay) return `today ${hhmm}`;
  return `${target.format("MMM")} ${target.date()} ${hhmm}`;
}
