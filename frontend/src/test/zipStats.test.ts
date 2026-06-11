import { describe, expect, it } from "vitest";

import type { ZipValue } from "../api/client";
import { deltaPct, percentileRank, stateMedian, topMovers } from "../lib/zipStats";

function rec(zip: string, yoy: number | null, value = 500000): ZipValue {
  return {
    zip,
    median_value: value,
    yoy_pct: yoy,
    cagr5_pct: null,
    ppsf: null,
    history: null,
    population: null,
    median_income: null,
    price_to_income: null,
    name: null,
  };
}

describe("zipStats (009 R2/R6)", () => {
  it("percentileRank", () => {
    expect(percentileRank([100, 200, 300, 400], 300)).toBe(75);
    expect(percentileRank([100], 100)).toBe(100);
    expect(percentileRank([], 100)).toBeNull();
  });

  it("stateMedian", () => {
    expect(stateMedian([300, 100, 200])).toBe(200);
    expect(stateMedian([100, 200])).toBe(150);
    expect(stateMedian([])).toBeNull();
  });

  it("deltaPct", () => {
    expect(deltaPct(110, 100)).toBe(10);
    expect(deltaPct(90, 100)).toBe(-10);
    expect(deltaPct(null, 100)).toBeNull();
    expect(deltaPct(100, 0)).toBeNull();
  });

  it("topMovers picks extremes and skips null YoY", () => {
    const records = new Map(
      [rec("1", 5), rec("2", -3), rec("3", null), rec("4", 12), rec("5", 1)].map((r) => [
        r.zip,
        r,
      ]),
    );
    const { gainers, losers } = topMovers(records, 2);
    expect(gainers.map((r) => r.zip)).toEqual(["4", "1"]);
    expect(losers.map((r) => r.zip)).toEqual(["2", "5"]);
  });

  it("topMovers handles sparse data", () => {
    const { gainers, losers } = topMovers(new Map([["1", rec("1", null)]]));
    expect(gainers).toEqual([]);
    expect(losers).toEqual([]);
  });
});
