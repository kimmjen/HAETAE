import { describe, expect, it } from "vitest";
import { formatLocalTimestamp, formatRelativeTime } from "./datetime";

describe("formatRelativeTime", () => {
  const now = 1_700_000_000_000;

  it("'just now' under one minute", () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe("just now");
    expect(formatRelativeTime(now, now)).toBe("just now");
  });
  it("minutes within the hour", () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatRelativeTime(now - 59 * 60_000, now)).toBe("59m ago");
  });
  it("hours within the day", () => {
    expect(formatRelativeTime(now - 2 * 3_600_000, now)).toBe("2h ago");
  });
  it("days beyond that", () => {
    expect(formatRelativeTime(now - 3 * 86_400_000, now)).toBe("3d ago");
  });
  it("future minutes within an hour", () => {
    expect(formatRelativeTime(now + 5 * 60_000, now)).toBe("in 5m");
  });
  it("future hours within a day", () => {
    expect(formatRelativeTime(now + 2 * 3_600_000, now)).toBe("in 2h");
  });
  it("future days beyond a day", () => {
    expect(formatRelativeTime(now + 3 * 86_400_000, now)).toBe("in 3d");
  });
  it("near-immediate future renders as <1m", () => {
    expect(formatRelativeTime(now + 30_000, now)).toBe("in <1m");
  });
});

describe("formatLocalTimestamp", () => {
  it("zero-pads month/day/hour/minute/second", () => {
    // Build a date *via local-time fields* so the test matches whichever
    // timezone the runner is in.
    const d = new Date(2026, 0, 5, 7, 8, 9); // Jan 5, 07:08:09
    const out = formatLocalTimestamp(d.getTime());
    expect(out).toBe("2026-01-05 07:08:09");
  });
});
