import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ZipValue } from "../api/client";
import ZipDetailPanel, { type ZipContext } from "../components/ZipDetailPanel";

const FULL: ZipValue = {
  zip: "98103",
  median_value: 937500,
  yoy_pct: -2.5,
  cagr5_pct: 1.6,
  ppsf: 612,
  history: [
    ["2024-Q1", 890000],
    ["2026-Q2", 937500],
  ],
  population: 48000,
  median_income: 112000,
  price_to_income: 8.4,
  name: "Fremont",
};

const OTHER: ZipValue = {
  zip: "99201",
  median_value: 450000,
  yoy_pct: 3.5,
  cagr5_pct: 4.0,
  ppsf: 280,
  history: null,
  population: 22000,
  median_income: 70000,
  price_to_income: 6.4,
  name: "Spokane",
};

const CONTEXT: ZipContext = {
  percentile: 82,
  vsStateMedianPct: 31.4,
  commuteReach: "Within a 30-min drive of work in typical midday — bad days run longer",
  driveToWork: "Drive to work: ~52 min (Mon 8:00 AM)",
  driveHome: "Drive home: ~64 min (Mon 5:30 PM)",
};

const EMPTY_CONTEXT: ZipContext = {
  percentile: null,
  vsStateMedianPct: null,
  commuteReach: null,
  driveToWork: null,
  driveHome: null,
};

function renderPanel(overrides: Partial<Parameters<typeof ZipDetailPanel>[0]> = {}) {
  const props = {
    zip: "98103",
    record: FULL as ZipValue | undefined,
    metroLabel: "Washington",
    stateCode: "WA",
    budget: 0,
    context: CONTEXT,
    onClose: vi.fn(),
    pinnedZip: null as string | null,
    pinnedRecord: undefined as ZipValue | undefined,
    onPin: vi.fn(),
    onUnpin: vi.fn(),
    ...overrides,
  };
  render(<ZipDetailPanel {...props} />);
  return props;
}

describe("ZipDetailPanel (009 R2/R9)", () => {
  it("renders the full record with ACS fields and context", () => {
    renderPanel();
    expect(screen.getByText("Fremont, WA 98103")).toBeInTheDocument(); // 012 R2
    expect(screen.getByText("$937,500")).toBeInTheDocument();
    expect(screen.getByText("-2.5%")).toBeInTheDocument();
    expect(screen.getByText("48,000")).toBeInTheDocument();
    expect(screen.getByText("$112,000")).toBeInTheDocument();
    expect(screen.getByText("8.4×")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText(/Within a 30-min drive/)).toBeInTheDocument();
    expect(screen.getByText(/Drive to work: ~52 min/)).toBeInTheDocument();
    expect(screen.getByText(/Drive home: ~64 min/)).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument(); // price chart
  });

  it("omits the routed drive lines when no estimate exists (011 R6)", () => {
    renderPanel({ context: EMPTY_CONTEXT });
    expect(screen.queryByText(/Drive to work/)).toBeNull();
    expect(screen.queryByText(/Drive home/)).toBeNull();
  });

  it("shows budget fit when a budget is set", () => {
    renderPanel({ budget: 1000000, context: EMPTY_CONTEXT });
    expect(screen.getByText("Under budget by $62,500")).toBeInTheDocument();
  });

  it("degrades to dashes without a record (R9)", () => {
    renderPanel({ zip: "99999", record: undefined, budget: 500000, context: EMPTY_CONTEXT });
    expect(screen.getByText("ZIP 99999")).toBeInTheDocument(); // no name -> ZIP label
    expect(screen.getByText("No price data")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText(/budget by/)).toBeNull(); // no value -> no badge
    expect(screen.getByText("No price history for this ZIP.")).toBeInTheDocument();
  });

  it("fires onClose", () => {
    const props = renderPanel({ context: EMPTY_CONTEXT });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe("ZipDetailPanel compare (009 R7)", () => {
  it("pin button fires onPin", () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Pin to compare" }));
    expect(props.onPin).toHaveBeenCalled();
  });

  it("shows the pinned hint when the selected ZIP is pinned", () => {
    const props = renderPanel({ pinnedZip: "98103", pinnedRecord: FULL });
    const btn = screen.getByRole("button", { name: /Pinned — click another ZIP/ });
    fireEvent.click(btn);
    expect(props.onUnpin).toHaveBeenCalled();
  });

  it("renders side-by-side with signed deltas when a different ZIP is pinned", () => {
    renderPanel({
      zip: "99201",
      record: OTHER,
      pinnedZip: "98103",
      pinnedRecord: FULL,
    });
    expect(screen.getByText("Compare")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("📌 Fremont 98103")).toBeInTheDocument(); // place label (012)
    expect(screen.getByText("$937,500")).toBeInTheDocument(); // pinned value
    expect(screen.getByText("$450,000")).toBeInTheDocument(); // selected value
    // 450000 vs 937500 -> -52.0% (selected relative to pinned)
    expect(screen.getByText("-52.0%")).toBeInTheDocument();
    // YoY: 3.5 vs -2.5 -> +6.0 percentage points
    expect(screen.getByText("+6.0% pt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpin 98103" })).toBeInTheDocument();
  });
});
