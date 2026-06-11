import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CommuteVariation } from "../api/client";
import CommuteControl from "../components/CommuteControl";
import { COMMUTE_STEPS } from "../config";

const variation: CommuteVariation = {
  offpeak_sqmi: 468,
  typical_sqmi: 380,
  peak_sqmi: 298,
  peak_shrink_pct: 36.2,
};

describe("CommuteControl (003)", () => {
  it("renders a button per step and marks the active one", () => {
    render(<CommuteControl minutes={30} onMinutesChange={() => {}} variation={variation} />);
    for (const m of COMMUTE_STEPS) {
      expect(screen.getByRole("button", { name: `${m} minutes` })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "30 minutes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("emits the chosen minutes", () => {
    const onChange = vi.fn();
    render(<CommuteControl minutes={30} onMinutesChange={onChange} variation={null} />);
    fireEvent.click(screen.getByRole("button", { name: "45 minutes" }));
    expect(onChange).toHaveBeenCalledWith(45);
  });

  it("starts with the traffic-scenarios fold expanded", () => {
    const { container } = render(
      <CommuteControl minutes={30} onMinutesChange={() => {}} variation={variation} />,
    );
    expect(container.querySelector("details")!.open).toBe(true);
  });

  it("shows the scenario legend with per-band areas and the shrink summary", () => {
    render(<CommuteControl minutes={30} onMinutesChange={() => {}} variation={variation} />);
    expect(screen.getByText("Light traffic")).toBeInTheDocument();
    expect(screen.getByText("Evening rush")).toBeInTheDocument();
    expect(screen.getByText("468 mi²")).toBeInTheDocument();
    expect(screen.getByText("298 mi²")).toBeInTheDocument();
    expect(screen.getByText(/36.2%/)).toBeInTheDocument();
  });

  it("falls back to a muted note when variation is unavailable", () => {
    render(<CommuteControl minutes={30} onMinutesChange={() => {}} variation={null} />);
    expect(screen.getByText(/variation unavailable/i)).toBeInTheDocument();
  });
});
