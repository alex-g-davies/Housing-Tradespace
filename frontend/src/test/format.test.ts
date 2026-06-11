import { describe, expect, it } from "vitest";

import {
  departLabel,
  formatPct,
  formatPpsf,
  formatSqMi,
  formatUsd,
  formatUsdCompact,
  placeLabel,
} from "../lib/format";

describe("format", () => {
  it("formats full currency with thousands separators", () => {
    expect(formatUsd(937500)).toBe("$937,500");
    expect(formatUsd(1250000)).toBe("$1,250,000");
  });

  it("formats compact currency in thousands", () => {
    expect(formatUsdCompact(937500)).toBe("$938k");
    expect(formatUsdCompact(450000)).toBe("$450k");
  });

  it("formats signed percent to one decimal", () => {
    expect(formatPct(4.2)).toBe("+4.2%");
    expect(formatPct(-1.5)).toBe("-1.5%");
    expect(formatPct(0)).toBe("0.0%");
  });

  it("formats price per square foot", () => {
    expect(formatPpsf(612)).toBe("$612/sqft");
    expect(formatPpsf(611.6)).toBe("$612/sqft");
  });

  it("formats area in square miles, with a dash for null", () => {
    expect(formatSqMi(467.8)).toBe("468 mi²");
    expect(formatSqMi(null)).toBe("—");
  });

  it("builds place labels with graceful fallbacks (012 R2)", () => {
    expect(placeLabel("98335", "Gig Harbor", "WA")).toBe("Gig Harbor, WA 98335");
    expect(placeLabel("98335", "Gig Harbor")).toBe("Gig Harbor 98335");
    expect(placeLabel("98335", null, "WA")).toBe("ZIP 98335");
  });

  it("formats departure labels as weekday + 12h time (011)", () => {
    expect(departLabel("2026-06-15T08:00")).toBe("Mon 8:00 AM");
    expect(departLabel("2026-06-15T17:30")).toBe("Mon 5:30 PM");
    expect(departLabel("not-a-date")).toBe("");
  });
});
