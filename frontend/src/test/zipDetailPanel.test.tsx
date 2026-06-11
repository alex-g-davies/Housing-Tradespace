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
};

const CONTEXT: ZipContext = {
  percentile: 82,
  vsStateMedianPct: 31.4,
  commuteReach: "Within the 30-min drive (midday) — ZIP center",
};

const EMPTY_CONTEXT: ZipContext = {
  percentile: null,
  vsStateMedianPct: null,
  commuteReach: null,
};

describe("ZipDetailPanel (009 R2/R9)", () => {
  it("renders the full record with ACS fields and context", () => {
    render(
      <ZipDetailPanel
        zip="98103"
        record={FULL}
        metroLabel="Washington"
        budget={0}
        context={CONTEXT}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("ZIP 98103")).toBeInTheDocument();
    expect(screen.getByText("$937,500")).toBeInTheDocument();
    expect(screen.getByText("-2.5%")).toBeInTheDocument();
    expect(screen.getByText("48,000")).toBeInTheDocument();
    expect(screen.getByText("$112,000")).toBeInTheDocument();
    expect(screen.getByText("8.4×")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText(/Within the 30-min drive/)).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument(); // price chart
  });

  it("shows budget fit when a budget is set", () => {
    render(
      <ZipDetailPanel
        zip="98103"
        record={FULL}
        metroLabel="Washington"
        budget={1000000}
        context={EMPTY_CONTEXT}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Under budget by $62,500")).toBeInTheDocument();
  });

  it("degrades to dashes without a record (R9)", () => {
    render(
      <ZipDetailPanel
        zip="99999"
        record={undefined}
        metroLabel="Ohio"
        budget={500000}
        context={EMPTY_CONTEXT}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("No price data")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText(/budget by/)).toBeNull(); // no value -> no badge
    expect(screen.getByText("No price history for this ZIP.")).toBeInTheDocument();
  });

  it("fires onClose", () => {
    const onClose = vi.fn();
    render(
      <ZipDetailPanel
        zip="98103"
        record={FULL}
        metroLabel="Washington"
        budget={0}
        context={EMPTY_CONTEXT}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
