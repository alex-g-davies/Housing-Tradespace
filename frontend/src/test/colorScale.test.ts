import { describe, expect, it } from "vitest";

import { COLOR_STOPS, NO_DATA_COLOR } from "../config";
import { colorForValue, fillOpacityExpression, isOverBudget } from "../lib/colorScale";

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
