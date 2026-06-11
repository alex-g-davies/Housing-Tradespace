import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ZipValue } from "../api/client";
import TopMovers from "../components/TopMovers";

function rec(zip: string, yoy: number | null): ZipValue {
  return {
    zip,
    median_value: 500000,
    yoy_pct: yoy,
    cagr5_pct: null,
    ppsf: null,
    history: null,
    population: null,
    median_income: null,
    price_to_income: null,
  };
}

const RECORDS = new Map(
  [
    rec("10001", 12.4),
    rec("10002", 8.0),
    rec("10003", 5.5),
    rec("10004", 3.1),
    rec("10005", 1.0),
    rec("10006", -0.5),
    rec("10007", -4.2),
  ].map((r) => [r.zip, r]),
);

describe("TopMovers (009 R6)", () => {
  it("lists the top five rising ZIPs by default", () => {
    render(<TopMovers records={RECORDS} onZipChosen={() => {}} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("10001");
    expect(rows[0]).toHaveTextContent("+12.4%");
  });

  it("toggles to falling ZIPs", () => {
    render(<TopMovers records={RECORDS} onZipChosen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Falling" }));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("10007");
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("-4.2%");
  });

  it("fires onZipChosen with the row's zip", () => {
    const onZipChosen = vi.fn();
    render(<TopMovers records={RECORDS} onZipChosen={onZipChosen} />);
    fireEvent.click(screen.getByRole("button", { name: /10001/ }));
    expect(onZipChosen).toHaveBeenCalledWith("10001");
  });

  it("renders nothing without YoY data", () => {
    const { container } = render(
      <TopMovers records={new Map([["1", rec("1", null)]])} onZipChosen={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is a collapsible fold that starts expanded (010 R4)", () => {
    const { container } = render(<TopMovers records={RECORDS} onZipChosen={() => {}} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details!.open).toBe(true);
    expect(screen.getByText("Top movers (YoY)").tagName).toBe("SUMMARY");
    fireEvent.click(screen.getByText("Top movers (YoY)"));
    expect(details!.open).toBe(false);
  });
});
