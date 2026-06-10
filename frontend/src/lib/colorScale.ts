// Pure helpers for the choropleth ramp and budget logic. Kept free of React/
// MapLibre so they are directly unit-testable (R2/R4).

import { COLOR_STOPS, type ColorStop, type MetricDef, NO_DATA_COLOR } from "../config";

/**
 * Quantile color stops for a distribution: `n` breaks at evenly spaced ranks
 * spanning [loQ, hiQ] (default 2nd–95th percentile), so the ramp covers the bulk
 * of the data with gradation at the top instead of clamping a 20% chunk to the
 * darkest color, and a lone outlier doesn't stretch the scale. Ties are nudged
 * to keep breaks strictly ascending (MapLibre interpolate needs increasing
 * inputs). Falls back to evenly-indexed breaks if data is degenerate.
 */
export function computeQuantileStops(
  values: (number | null | undefined)[],
  colors: string[],
  loQ = 0.02,
  hiQ = 0.95,
): ColorStop[] {
  const clean = values
    .filter((v): v is number => v != null && !Number.isNaN(v))
    .sort((a, b) => a - b);
  const n = colors.length;
  if (clean.length === 0) return colors.map((color, i) => ({ value: i, color }));

  const stops: ColorStop[] = [];
  for (let i = 0; i < n; i++) {
    const q = n === 1 ? loQ : loQ + ((hiQ - loQ) * i) / (n - 1);
    const idx = Math.min(clean.length - 1, Math.max(0, Math.round(q * (clean.length - 1))));
    let value = clean[idx];
    if (i > 0 && value <= stops[i - 1].value) value = stops[i - 1].value + 1;
    stops.push({ value, color: colors[i] });
  }
  return stops;
}

/** Read a numeric metric property off MapLibre/GeoJSON features, dropping nulls. */
export function metricValuesFromFeatures(
  features: { properties?: Record<string, unknown> | null }[],
  property: string,
): number[] {
  const out: number[] = [];
  for (const f of features) {
    const v = f.properties?.[property];
    if (typeof v === "number" && !Number.isNaN(v)) out.push(v);
  }
  return out;
}

/** Resolve the ramp stops for a metric: fixed (YoY) or per-region quantiles. */
export function resolveStops(metric: MetricDef, values: (number | null | undefined)[]): ColorStop[] {
  return metric.fixedStops ?? computeQuantileStops(values, metric.colors);
}

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
