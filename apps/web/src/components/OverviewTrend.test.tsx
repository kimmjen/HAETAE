import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewTrend } from "./OverviewTrend";
import type { UsageDayPoint } from "@/hooks/useUsageLocal";

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

vi.mock("recharts", () => {
  const passthrough =
    (testId?: string) =>
    ({ children }: { children?: React.ReactNode }) =>
      <div data-testid={testId}>{children}</div>;
  return {
    ResponsiveContainer: passthrough(),
    BarChart: passthrough(),
    Bar: passthrough(),
    Cell: passthrough(),
    XAxis: passthrough(),
    YAxis: passthrough(),
    CartesianGrid: passthrough(),
    Tooltip: passthrough(),
  };
});

function makeData(): UsageDayPoint[] {
  return [
    { day: "2026-04-30", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 100 },
    { day: "2026-05-01", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 200 },
    { day: "2026-05-02", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 50 },
  ];
}

describe("OverviewTrend", () => {
  it("renders the Recharts BarChart container when data is present", () => {
    render(<OverviewTrend data={makeData()} />);
    expect(screen.getByTestId("overview-trend-chart")).toBeInTheDocument();
  });

  it("shows peak and avg in the header", () => {
    render(<OverviewTrend data={makeData()} />);
    const peakNode = screen.getByText(/peak \$200/);
    expect(peakNode).toBeInTheDocument();
    expect(peakNode.textContent).toMatch(/avg \$116/);
  });

  it("hides peak/avg meta when data is empty", () => {
    render(<OverviewTrend data={[]} />);
    expect(screen.queryByText(/peak/)).toBeNull();
  });

  it("renders an empty-state message when data is empty", () => {
    render(<OverviewTrend data={[]} />);
    expect(screen.getByText(/No usage recorded yet/)).toBeInTheDocument();
  });
});
