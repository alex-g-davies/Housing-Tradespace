// Pure helpers for the choropleth ramp and budget logic. Kept free of React/
// MapLibre so they are directly unit-testable (R2/R4).

import { COLOR_STOPS, type ColorStop, type MetricDef, NO_DATA_COLOR } from "../config";

/**
 * Equal-count color stops: break i is the value at rank i/n of the state's
 * distribution, so each color bucket holds ~the same number of ZIPs. Paired
 * with the stepped fill expression this guarantees every hue is well
 * represented no matter how concentrated the market is — the fix for ramps
 * where most of a metro collapsed into one or two shades. Ties are nudged to
 * keep breaks strictly ascending (MapLibre step needs increasing inputs);
 * degenerate data falls back to evenly-indexed breaks.
 */
export function computeEqualCountStops(
  values: (number | null | undefined)[],
  colors: string[],
): ColorStop[] {
  const clean = values
    .filter((v): v is number => v != null && !Number.isNaN(v))
    .sort((a, b) => a - b);
  const n = colors.length;
  if (clean.length === 0) return colors.map((color, i) => ({ value: i, color }));

  const stops: ColorStop[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.min(clean.length - 1, Math.floor((i * clean.length) / n));
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

/** Resolve the ramp stops for a metric: fixed (YoY) or per-state equal-count. */
export function resolveStops(
  metric: MetricDef,
  values: (number | null | undefined)[],
): ColorStop[] {
  return metric.fixedStops ?? computeEqualCountStops(values, metric.colors);
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
 * property + ramp. Discrete `step` buckets (not interpolation) so each legend
 * color maps to exactly one bucket of ZIPs. ZIPs lacking the property
 * (omitted by the backend) fall through to the no-data color.
 */
export function fillColorExpression(property: string, stops: ColorStop[]): unknown[] {
  const step: unknown[] = ["step", ["get", property], stops[0].color];
  for (const stop of stops.slice(1)) {
    step.push(stop.value, stop.color);
  }
  return ["case", ["has", property], step, NO_DATA_COLOR];
}

/**
 * MapLibre filter selecting the ZIPs the over-budget hatch layer paints
 * (017 R3). Mirrors isOverBudget: strictly above budget only; no budget or
 * no value -> match nothing (the layer renders empty, no toggling needed).
 */
export function overBudgetFilter(budget: number | null | undefined): unknown[] {
  if (budget == null || Number.isNaN(budget) || budget <= 0) {
    return ["boolean", false];
  }
  return ["all", ["has", "median_value"], [">", ["get", "median_value"], budget]];
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
