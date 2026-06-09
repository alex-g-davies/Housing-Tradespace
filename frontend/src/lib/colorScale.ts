// Pure helpers for the choropleth ramp and budget logic. Kept free of React/
// MapLibre so they are directly unit-testable (R2/R4).

import { COLOR_STOPS, type ColorStop, NO_DATA_COLOR } from "../config";

/** Color for a median value, or the no-data color when value is missing. */
export function colorForValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return NO_DATA_COLOR;
  // Below the first stop -> lightest; at/above the last -> darkest.
  let color = COLOR_STOPS[0].color;
  for (const stop of COLOR_STOPS) {
    if (value >= stop.value) color = stop.color;
  }
  return color;
}

/**
 * A ZIP is "over budget" only when it has a value strictly greater than the
 * budget. At-budget is included (affordable); missing values and a zero/empty
 * budget are never over budget.
 */
export function isOverBudget(
  value: number | null | undefined,
  budget: number | null | undefined,
): boolean {
  if (value == null || Number.isNaN(value)) return false;
  if (budget == null || Number.isNaN(budget) || budget <= 0) return false;
  return value > budget;
}

/**
 * Build the MapLibre data-driven fill-color expression for a given metric
 * property + ramp. ZIPs lacking the property (omitted by the backend) fall
 * through to the no-data color.
 */
export function fillColorExpression(property: string, stops: ColorStop[]): unknown[] {
  const interpolate: unknown[] = ["interpolate", ["linear"], ["get", property]];
  for (const stop of stops) {
    interpolate.push(stop.value, stop.color);
  }
  return ["case", ["has", property], interpolate, NO_DATA_COLOR];
}

/**
 * Build the MapLibre fill-opacity expression that de-emphasizes over-budget
 * ZIPs (R4). With no budget (<=0) every ZIP renders at full opacity.
 */
export function fillOpacityExpression(
  budget: number,
  inBudget: number,
  overBudget: number,
): number | unknown[] {
  if (!budget || budget <= 0) return inBudget;
  return [
    "case",
    ["all", ["has", "median_value"], [">", ["get", "median_value"], budget]],
    overBudget,
    inBudget,
  ];
}
