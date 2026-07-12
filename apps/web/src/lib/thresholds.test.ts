import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getThresholds,
  setThresholds,
  subscribeThresholds,
} from "./thresholds";

describe("thresholds storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns nulls when nothing is set", () => {
    expect(getThresholds()).toEqual({
      fiveHourUsd: null,
      dailyUsd: null,
      weeklyUsd: null,
      monthlyUsd: null,
    });
  });

  it("round-trips positive numbers across all four windows", () => {
    setThresholds({
      fiveHourUsd: 5,
      dailyUsd: 12.5,
      weeklyUsd: 80,
      monthlyUsd: 200,
    });
    expect(getThresholds()).toEqual({
      fiveHourUsd: 5,
      dailyUsd: 12.5,
      weeklyUsd: 80,
      monthlyUsd: 200,
    });
  });

  it("treats zero / negative / NaN as cleared", () => {
    window.localStorage.setItem("haetae:threshold-daily-usd", "0");
    window.localStorage.setItem("haetae:threshold-monthly-usd", "abc");
    expect(getThresholds()).toEqual({
      fiveHourUsd: null,
      dailyUsd: null,
      weeklyUsd: null,
      monthlyUsd: null,
    });
  });

  it("clears when explicitly set to null", () => {
    setThresholds({ dailyUsd: 50 });
    expect(getThresholds().dailyUsd).toBe(50);
    setThresholds({ dailyUsd: null });
    expect(getThresholds().dailyUsd).toBeNull();
  });

  it("notifies subscribers on change", () => {
    const listener = vi.fn();
    const unsub = subscribeThresholds(listener);
    setThresholds({ dailyUsd: 10 });
    expect(listener).toHaveBeenCalledTimes(1);
    setThresholds({ monthlyUsd: 100 });
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
    setThresholds({ dailyUsd: 20 });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
