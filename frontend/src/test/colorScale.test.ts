import { describe, expect, it } from "vitest";

import { COLOR_STOPS, NO_DATA_COLOR, YOY_STOPS } from "../config";
import {
  colorForValue,
  computeQuantileStops,
  fillColorExpression,
  fillOpacityExpression,
  isOverBudget,
  metricValuesFromFeatures,
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

describe("computeQuantileStops (national adaptive ramps)", () => {
  const colors = ["a", "b", "c", "d", "e"];

  it("spreads breaks across the value distribution, ascending", () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const stops = computeQuantileStops(values, colors);
    expect(stops).toHaveLength(colors.length);
    expect(stops[0].value).toBe(100); // min
    for (let i = 1; i < stops.length; i++) expect(stops[i].value).toBeGreaterThan(stops[i - 1].value);
    expect(stops.map((s) => s.color)).toEqual(colors);
  });

  it("keeps breaks strictly ascending even with heavy ties", () => {
    const stops = computeQuantileStops([5, 5, 5, 5, 5], colors);
    for (let i = 1; i < stops.length; i++) expect(stops[i].value).toBeGreaterThan(stops[i - 1].value);
  });

  it("ignores null/NaN and falls back when empty", () => {
    expect(computeQuantileStops([null, NaN, undefined], colors)).toHaveLength(colors.length);
  });

  it("puts the top break near the high end (≈95th pct), not clamped at the 80th", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const stops = computeQuantileStops(values, colors);
    expect(stops[stops.length - 1].value).toBeGreaterThanOrEqual(90); // ~p95, not p80=80
    expect(stops[0].value).toBeLessThanOrEqual(5); // ~p2
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
  it("builds a no-data-guarded interpolate over the given property + stops", () => {
    const expr = fillColorExpression("yoy_pct", YOY_STOPS);
    expect(expr[0]).toBe("case");
    expect(expr[1]).toEqual(["has", "yoy_pct"]); // missing -> no-data
    expect(expr[3]).toBe(NO_DATA_COLOR);
    const interpolate = expr[2] as unknown[];
    expect(interpolate[0]).toBe("interpolate");
    expect(interpolate[2]).toEqual(["get", "yoy_pct"]);
    // first stop value + color follow the head
    expect(interpolate).toContain(YOY_STOPS[0].value);
    expect(interpolate).toContain(YOY_STOPS[0].color);
  });

  it("targets the requested property (value vs ppsf)", () => {
    expect(fillColorExpression("median_value", COLOR_STOPS)[1]).toEqual(["has", "median_value"]);
    expect(fillColorExpression("ppsf", COLOR_STOPS)[1]).toEqual(["has", "ppsf"]);
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
