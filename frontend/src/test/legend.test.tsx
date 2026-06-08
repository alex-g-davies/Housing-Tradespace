import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Legend from "../components/Legend";
import { COLOR_STOPS } from "../config";

describe("Legend (R2)", () => {
  it("renders a swatch per ramp stop plus a no-data entry", () => {
    const { container } = render(<Legend budget={0} />);
    const swatches = container.querySelectorAll(".legend-swatch");
    // one per color stop + the no-data entry
    expect(swatches.length).toBe(COLOR_STOPS.length + 1);
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("shows an over-budget entry only once a budget is set (R4)", () => {
    const { rerender } = render(<Legend budget={0} />);
    expect(screen.queryByText("Over budget")).not.toBeInTheDocument();
    rerender(<Legend budget={800000} />);
    expect(screen.getByText("Over budget")).toBeInTheDocument();
  });
});
