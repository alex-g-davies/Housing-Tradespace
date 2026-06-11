import { describe, expect, it } from "vitest";

import type { ZipValue } from "../api/client";
import { buildZipPopupHtml } from "../lib/popup";

const full: ZipValue = {
  zip: "98103",
  median_value: 937500,
  yoy_pct: -2.5,
  cagr5_pct: 1.6,
  ppsf: 612,
  history: [
    ["2021-Q3", 890000],
    ["2026-Q2", 937500],
  ],
  population: 45000,
  median_income: 110000,
  price_to_income: 8.5,
};

describe("buildZipPopupHtml", () => {
  it("renders all metrics, sparkline, and list-$/sqft label", () => {
    const html = buildZipPopupHtml("98103", full);
    expect(html).toContain("ZIP 98103");
    expect(html).toContain("$937,500");
    expect(html).toContain("-2.5% YoY");
    expect(html).toContain("tip__metric--down"); // negative YoY styled down
    expect(html).toContain("+1.6%/yr");
    expect(html).toContain("$612/sqft sold");
    expect(html).toContain("<svg"); // sparkline present
  });

  it("falls back to 'No price data' when the record is missing", () => {
    const html = buildZipPopupHtml("99999", undefined);
    expect(html).toContain("ZIP 99999");
    expect(html).toContain("No price data");
    expect(html).not.toContain("<svg");
  });

  it("omits absent optional metrics and shows $/sqft n/a", () => {
    const partial: ZipValue = {
      zip: "98109",
      median_value: 890000,
      yoy_pct: null,
      cagr5_pct: null,
      ppsf: null,
      history: null,
      population: null,
      median_income: null,
      price_to_income: null,
    };
    const html = buildZipPopupHtml("98109", partial);
    expect(html).toContain("$890,000");
    expect(html).not.toContain("YoY");
    expect(html).toContain("$/sqft: n/a");
    expect(html).not.toContain("<svg");
  });
});
