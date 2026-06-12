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

function renderControl(overrides: Partial<Parameters<typeof CommuteControl>[0]> = {}) {
  const props = {
    minutes: 30,
    onMinutesChange: vi.fn(),
    variation: variation as CommuteVariation | null,
    dual: false,
    mode: "drive" as const,
    onModeChange: vi.fn(),
    ...overrides,
  };
  render(<CommuteControl {...props} />);
  return props;
}

describe("CommuteControl (003/013)", () => {
  it("renders a button per step and marks the active one", () => {
    renderControl();
    for (const m of COMMUTE_STEPS) {
      expect(screen.getByRole("button", { name: `${m} minutes` })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "30 minutes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("emits the chosen minutes", () => {
    const props = renderControl({ variation: null });
    fireEvent.click(screen.getByRole("button", { name: "45 minutes" }));
    expect(props.onMinutesChange).toHaveBeenCalledWith(45);
  });

  it("offers drive/cycle/walk modes and emits changes (013 R2)", () => {
    const props = renderControl();
    expect(screen.getByRole("button", { name: "Driving" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Walking" }));
    expect(props.onModeChange).toHaveBeenCalledWith("walk");
  });

  it("hides the traffic-scenarios fold for non-drive modes", () => {
    const { container } = render(
      <CommuteControl
        minutes={30}
        onMinutesChange={() => {}}
        variation={null}
        dual={false}
        mode="walk"
        onModeChange={() => {}}
      />,
    );
    expect(container.querySelector("details")).toBeNull();
  });

  it("titles the fold as shared reach in dual mode (016 R5)", () => {
    renderControl({ dual: true });
    expect(screen.getByText("Shared reach (both commutes)")).toBeInTheDocument();
  });

  it("starts with the traffic-scenarios fold expanded for drive", () => {
    renderControl();
    const details = document.querySelector("details");
    expect(details).not.toBeNull();
    expect(details!.open).toBe(true);
  });

  it("shows the scenario legend with per-band areas and the shrink summary", () => {
    renderControl();
    expect(screen.getByText("Light traffic")).toBeInTheDocument();
    expect(screen.getByText("Evening rush")).toBeInTheDocument();
    expect(screen.getByText("468 mi²")).toBeInTheDocument();
    expect(screen.getByText("298 mi²")).toBeInTheDocument();
    expect(screen.getByText(/36.2%/)).toBeInTheDocument();
  });

  it("falls back to a muted note when variation is unavailable", () => {
    renderControl({ variation: null });
    expect(screen.getByText(/variation unavailable/i)).toBeInTheDocument();
  });
});
