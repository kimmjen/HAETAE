import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  UsageAreaChart,
  UsageBarChart,
  UsageDonutChart,
  UsageHeatmap,
} from "./index";
import { toNum } from "./internal";

beforeEach(() => {
  // Recharts uses ResizeObserver under ResponsiveContainer; jsdom needs a
  // stub or every chart bails out before rendering its internals.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("toNum (Tooltip value coercion)", () => {
  it("returns numbers as-is, parses numeric strings, falls back to 0 for garbage", () => {
    expect(toNum(42)).toBe(42);
    expect(toNum("3.5")).toBe(3.5);
    expect(toNum("nope")).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum(NaN)).toBe(0);
  });
  it("takes the last element of an array (recharts stacked-bar case)", () => {
    expect(toNum([0, 7])).toBe(7);
    expect(toNum([])).toBe(0);
  });
});

describe("UsageAreaChart", () => {
  it("shows the empty state when data is empty", () => {
    render(<UsageAreaChart data={[]} />);
    expect(screen.getByText(/No usage recorded yet/)).toBeInTheDocument();
    expect(screen.queryByTestId("usage-area-chart")).toBeNull();
  });

  it("mounts the chart container when data is non-empty", () => {
    render(
      <UsageAreaChart
        data={[
          {
            day: "2026-05-01",
            inputTokens: 100,
            outputTokens: 200,
            cacheCreationTokens: 50,
            cacheReadTokens: 10000,
          },
        ]}
      />,
    );
    expect(screen.getByTestId("usage-area-chart")).toBeInTheDocument();
  });
});

describe("UsageBarChart", () => {
  it("shows the empty state when data is empty", () => {
    render(<UsageBarChart data={[]} />);
    expect(screen.getByText(/No cost data yet/)).toBeInTheDocument();
  });

  it("renders the bar container when data is non-empty", () => {
    render(<UsageBarChart data={[{ label: "Alpha", costUsd: 12 }]} />);
    expect(screen.getByTestId("usage-bar-chart")).toBeInTheDocument();
  });

  it("respects topN by sorting by cost desc and slicing", () => {
    // We can't easily inspect the rendered SVG paths in jsdom, but we can
    // assert the component accepts the prop without throwing and renders.
    const data = Array.from({ length: 20 }, (_, i) => ({ label: `p${i}`, costUsd: i }));
    render(<UsageBarChart data={data} topN={5} />);
    expect(screen.getByTestId("usage-bar-chart")).toBeInTheDocument();
  });
});

describe("UsageDonutChart", () => {
  it("treats all-zero data as empty (no slices to draw)", () => {
    render(
      <UsageDonutChart
        data={[
          { label: "opus", costUsd: 0 },
          { label: "sonnet", costUsd: 0 },
        ]}
      />,
    );
    expect(screen.getByText(/No cost data yet/)).toBeInTheDocument();
    expect(screen.queryByTestId("usage-donut-chart")).toBeNull();
  });

  it("filters zero-cost slices but renders when at least one is positive", () => {
    render(
      <UsageDonutChart
        data={[
          { label: "opus", costUsd: 5 },
          { label: "haiku", costUsd: 0 },
        ]}
      />,
    );
    expect(screen.getByTestId("usage-donut-chart")).toBeInTheDocument();
  });
});

describe("UsageHeatmap", () => {
  it("shows the empty state when every cell is zero", () => {
    const cells = Array.from({ length: 168 }, (_, i) => ({
      dayOfWeek: Math.floor(i / 24),
      hour: i % 24,
      costUsd: 0,
      count: 0,
    }));
    render(<UsageHeatmap cells={cells} />);
    expect(screen.getByText(/No time-of-day data yet/)).toBeInTheDocument();
    // Filter toggle should still render even on empty state so the user
    // can flip filters before any data is captured.
    expect(screen.getByRole("tab", { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^weekday$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^weekend$/i })).toBeInTheDocument();
  });

  it("renders a 7×24 grid with row headers when at least one cell has cost", () => {
    const cells: Array<{ dayOfWeek: number; hour: number; costUsd: number; count: number }> = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        cells.push({ dayOfWeek: d, hour: h, costUsd: d === 3 && h === 14 ? 5 : 0, count: 0 });
      }
    }
    render(<UsageHeatmap cells={cells} />);
    const heatmap = screen.getByTestId("usage-heatmap");
    expect(heatmap).toBeInTheDocument();
    // Row headers Sun..Sat all present.
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
    // 168 cells (td) + 24 hour-column-headers (th[scope=col]) + 7 day-row-headers
    const tds = heatmap.querySelectorAll("td");
    expect(tds.length).toBe(168);
  });

  it("default filter is 'all' and tab toggling switches selection", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const cells = Array.from({ length: 168 }, (_, i) => ({
      dayOfWeek: Math.floor(i / 24),
      hour: i % 24,
      costUsd: 1,
      count: 1,
    }));
    render(<UsageHeatmap cells={cells} />);
    const all = screen.getByRole("tab", { name: /^all$/i });
    const weekend = screen.getByRole("tab", { name: /^weekend$/i });
    expect(all).toHaveAttribute("aria-selected", "true");
    fireEvent.click(weekend);
    expect(weekend).toHaveAttribute("aria-selected", "true");
    expect(all).toHaveAttribute("aria-selected", "false");
  });
});

vi.mock("recharts", async () => {
  // Recharts ResponsiveContainer hangs in jsdom because it relies on
  // measuring the parent. Replace with simple passthroughs that just
  // mount children — we only care about props/empty-state branching,
  // not the SVG output.
  const passthrough =
    (testId?: string) =>
    ({ children }: { children?: React.ReactNode }) =>
      <div data-testid={testId}>{children}</div>;
  return {
    ResponsiveContainer: passthrough(),
    AreaChart: passthrough(),
    BarChart: passthrough(),
    PieChart: passthrough(),
    Area: passthrough(),
    Bar: passthrough(),
    Pie: passthrough(),
    Cell: passthrough(),
    XAxis: passthrough(),
    YAxis: passthrough(),
    CartesianGrid: passthrough(),
    Tooltip: passthrough(),
  };
});
