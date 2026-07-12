import { describe, expect, it } from "vitest";
import {
  formatLocalTimestamp,
  formatRelativeTime,
  formatResetTime,
} from "./datetime";

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

describe("formatResetTime", () => {
  // 같은 day-of-year 보장을 위해 now / target 둘 다 로컬 필드로 생성.
  const now = new Date(2026, 4, 11, 9, 0).getTime(); // May 11, 09:00

  it("같은 날은 today HH:mm", () => {
    const target = new Date(2026, 4, 11, 20, 50).getTime(); // May 11, 20:50
    expect(formatResetTime(target, now)).toBe("today 20:50");
  });

  it("다른 날은 Mon D HH:mm", () => {
    const target = new Date(2026, 4, 17, 16, 0).getTime(); // May 17, 16:00
    expect(formatResetTime(target, now)).toBe("May 17 16:00");
  });

  it("ISO 문자열도 받음", () => {
    const isoTarget = new Date(2026, 4, 11, 20, 50).toISOString();
    expect(formatResetTime(isoTarget, now)).toBe("today 20:50");
  });

  it("null / undefined / invalid 은 빈 문자열", () => {
    expect(formatResetTime(null, now)).toBe("");
    expect(formatResetTime(undefined, now)).toBe("");
    expect(formatResetTime("not-a-date", now)).toBe("");
  });

  it("분도 zero-pad", () => {
    const target = new Date(2026, 4, 11, 7, 5).getTime();
    expect(formatResetTime(target, now)).toBe("today 07:05");
  });
});
