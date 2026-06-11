import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PriceChart from "../components/PriceChart";

const HISTORY: [string, number][] = [
  ["2024-Q1", 600000],
  ["2024-Q3", 650000],
  ["2025-Q1", 700000],
  ["2025-Q3", 720000],
];

describe("PriceChart (009 R4)", () => {
  it("renders min/max gridline labels and quarter range", () => {
    render(<PriceChart history={HISTORY} />);
    const svg = screen.getByRole("img");
    expect(svg).toHaveAccessibleName("Median value by quarter, 2024-Q1 to 2025-Q3");
    expect(svg).toHaveTextContent("$600k"); // min gridline
    expect(svg).toHaveTextContent("$720k"); // max gridline
    expect(svg).toHaveTextContent("2024-Q1");
    expect(svg).toHaveTextContent("2025-Q3");
  });

  it("shows a placeholder without enough history", () => {
    render(<PriceChart history={null} />);
    expect(screen.getByText("No price history for this ZIP.")).toBeInTheDocument();
  });

  it("shows a placeholder for a single point", () => {
    render(<PriceChart history={[["2025-Q1", 500000]]} />);
    expect(screen.getByText("No price history for this ZIP.")).toBeInTheDocument();
  });
});
