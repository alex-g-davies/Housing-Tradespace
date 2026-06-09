import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Legend from "../components/Legend";
import { METRICS } from "../config";

const VALUE = METRICS.find((m) => m.key === "value")!;
const YOY = METRICS.find((m) => m.key === "yoy")!;

describe("Legend (R2/002)", () => {
  it("renders a swatch per ramp stop plus a no-data entry for the active metric", () => {
    const { container } = render(<Legend metric={VALUE} budget={0} />);
    const swatches = container.querySelectorAll(".legend-swatch");
    expect(swatches.length).toBe(VALUE.stops.length + 1);
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("Median value")).toBeInTheDocument();
  });

  it("shows the over-budget entry only for the value metric with a budget set (R4)", () => {
    const { rerender } = render(<Legend metric={VALUE} budget={0} />);
    expect(screen.queryByText("Over budget")).not.toBeInTheDocument();
    rerender(<Legend metric={VALUE} budget={800000} />);
    expect(screen.getByText("Over budget")).toBeInTheDocument();
    // Over-budget is value-only — not shown when shading by YoY.
    rerender(<Legend metric={YOY} budget={800000} />);
    expect(screen.queryByText("Over budget")).not.toBeInTheDocument();
  });

  it("formats boundaries with the metric's formatter (e.g. percent for YoY)", () => {
    const { container } = render(<Legend metric={YOY} budget={0} />);
    expect(screen.getByText("YoY change")).toBeInTheDocument();
    // Legend rows use the metric formatter -> percent labels for YoY.
    const rows = within(container).getAllByText(/%/);
    expect(rows.length).toBeGreaterThan(0);
  });
});
