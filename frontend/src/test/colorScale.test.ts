import { describe, expect, it } from "vitest";

import { COLOR_STOPS, NO_DATA_COLOR, YOY_STOPS } from "../config";
import {
  colorForValue,
  computeEqualCountStops,
  fillColorExpression,
  fillOpacityExpression,
  isOverBudget,
  metricValuesFromFeatures,
  overBudgetFilter,
} from "../lib/colorScale";

describe("colorForValue (R2)", () => {
  it("returns the no-data color for missing values", () => {
    expect(colorForValue(null)).toBe(NO_DATA_COLOR);
    expect(colorForValue(undefined)).toBe(NO_DATA_COLOR);
    expect(colorForValue(NaN)).toBe(NO_DATA_COLOR);
  });

  it("clamps below the first stop to the lightest color", () => {
    expect(colorForValue(100_000)).toBe(COLOR_STOPS[0].color);
  });

  it("maps high values to the darkest stop", () => {
    const darkest = COLOR_STOPS[COLOR_STOPS.length - 1];
    expect(colorForValue(darkest.value + 500_000)).toBe(darkest.color);
  });

  it("picks the stop at or below the value", () => {
    expect(colorForValue(COLOR_STOPS[1].value)).toBe(COLOR_STOPS[1].color);
    expect(colorForValue(COLOR_STOPS[1].value - 1)).toBe(COLOR_STOPS[0].color);
  });
});

describe("isOverBudget (R4)", () => {
  it("treats at-budget as affordable (inclusive)", () => {
    expect(isOverBudget(800_000, 800_000)).toBe(false);
  });

  it("flags strictly-over-budget values", () => {
    expect(isOverBudget(800_001, 800_000)).toBe(true);
  });

  it("never flags missing values or a zero/empty budget", () => {
    expect(isOverBudget(null, 800_000)).toBe(false);
    expect(isOverBudget(900_000, 0)).toBe(false);
    expect(isOverBudget(900_000, null)).toBe(false);
  });
});

describe("computeEqualCountStops (per-state equal-count buckets)", () => {
  const colors = ["a", "b", "c", "d", "e"];

  it("puts breaks at equal-count ranks so each bucket holds ~the same number", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const stops = computeEqualCountStops(values, colors);
    // Buckets: [1,21) [21,41) [41,61) [61,81) [81,∞) — 20 values each.
    expect(stops.map((s) => s.value)).toEqual([1, 21, 41, 61, 81]);
    expect(stops.map((s) => s.color)).toEqual(colors);
  });

  it("equal counts hold even for a heavily skewed distribution", () => {
    // 80 cheap ZIPs at ~100k, 20 expensive at ~1M — the old linear spread
    // collapsed the cheap 80% into one shade; equal-count keeps them spread.
    const values = [
      ...Array.from({ length: 80 }, (_, i) => 100_000 + i * 100),
      ...Array.from({ length: 20 }, (_, i) => 1_000_000 + i * 10_000),
    ];
    const stops = computeEqualCountStops(values, colors);
    const buckets = colors.map(
      (_, i) =>
        values.filter(
          (v) =>
            v >= stops[i].value && (i === colors.length - 1 || v < stops[i + 1].value),
        ).length,
    );
    for (const count of buckets) expect(count).toBe(20);
  });

  it("keeps breaks strictly ascending even with heavy ties", () => {
    const stops = computeEqualCountStops([5, 5, 5, 5, 5], colors);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].value).toBeGreaterThan(stops[i - 1].value);
    }
  });

  it("ignores null/NaN and falls back when empty", () => {
    expect(computeEqualCountStops([null, NaN, undefined], colors)).toHaveLength(colors.length);
  });
});

describe("metricValuesFromFeatures", () => {
  it("reads the numeric property and drops null/non-number", () => {
    const features = [
      { properties: { median_value: 500000 } },
      { properties: { median_value: null } },
      { properties: {} },
      { properties: { median_value: 750000 } },
    ];
    expect(metricValuesFromFeatures(features, "median_value")).toEqual([500000, 750000]);
  });
});

describe("fillColorExpression (R2/002)", () => {
  it("builds a no-data-guarded STEP expression (discrete buckets)", () => {
    const expr = fillColorExpression("yoy_pct", YOY_STOPS);
    expect(expr[0]).toBe("case");
    expect(expr[1]).toEqual(["has", "yoy_pct"]); // missing -> no-data
    expect(expr[3]).toBe(NO_DATA_COLOR);
    const step = expr[2] as unknown[];
    expect(step[0]).toBe("step");
    expect(step[1]).toEqual(["get", "yoy_pct"]);
    expect(step[2]).toBe(YOY_STOPS[0].color); // base color below the 2nd break
    // subsequent break/color pairs
    expect(step).toContain(YOY_STOPS[1].value);
    expect(step).toContain(YOY_STOPS[1].color);
    expect(step).not.toContain(YOY_STOPS[0].value); // first break is implicit
  });

  it("targets the requested property (value vs ppsf)", () => {
    expect(fillColorExpression("median_value", COLOR_STOPS)[1]).toEqual(["has", "median_value"]);
    expect(fillColorExpression("ppsf", COLOR_STOPS)[1]).toEqual(["has", "ppsf"]);
  });
});

describe("overBudgetFilter (017 R3)", () => {
  it("matches only valued features strictly above the budget", () => {
    expect(overBudgetFilter(800_000)).toEqual([
      "all",
      ["has", "median_value"],
      [">", ["get", "median_value"], 800_000],
    ]);
  });

  it("never matches when the budget is unset, zero, or invalid", () => {
    const never = ["boolean", false];
    expect(overBudgetFilter(0)).toEqual(never);
    expect(overBudgetFilter(-1)).toEqual(never);
    expect(overBudgetFilter(null)).toEqual(never);
    expect(overBudgetFilter(undefined)).toEqual(never);
    expect(overBudgetFilter(NaN)).toEqual(never);
  });
});

describe("fillOpacityExpression (R4)", () => {
  it("returns a flat opacity when no budget is set", () => {
    expect(fillOpacityExpression(0, 0.85, 0.15)).toBe(0.85);
  });

  it("returns a case expression that de-emphasizes over-budget ZIPs", () => {
    const expr = fillOpacityExpression(800_000, 0.85, 0.15);
    expect(Array.isArray(expr)).toBe(true);
    expect((expr as unknown[])[0]).toBe("case");
    // over-budget value, then in-budget value at the tail
    expect(expr).toContain(0.15);
    expect(expr).toContain(0.85);
  });
});
