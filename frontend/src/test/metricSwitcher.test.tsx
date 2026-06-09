import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { METRICS } from "../config";
import MetricSwitcher from "../components/MetricSwitcher";

describe("MetricSwitcher (002)", () => {
  it("renders a button per metric and marks the active one pressed", () => {
    render(<MetricSwitcher active="value" onChange={() => {}} />);
    for (const m of METRICS) expect(screen.getByRole("button", { name: m.label })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Median value" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "YoY change" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("emits the chosen metric key", () => {
    const onChange = vi.fn();
    render(<MetricSwitcher active="value" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "YoY change" }));
    expect(onChange).toHaveBeenCalledWith("yoy");
  });
});
