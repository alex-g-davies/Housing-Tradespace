// Single source of truth for shared map/legend constants. The color ramps live
// here so the choropleth and the legend can never drift apart (R2).

import { formatPct, formatPpsf, formatUsdCompact } from "./lib/format";

// Backend API base. In dev, Vite proxies /api -> http://localhost:8000, so the
// frontend only ever calls its own origin — no Mapbox token reaches the client (R5).
export const API_BASE = "/api";

// Keyless MapLibre basemap. Using Mapbox tiles would require a token in the
// client, which would violate R5 — CARTO Positron needs no token and its light
// ground maximizes choropleth legibility.
export const BASEMAP_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Initial view centered on the Seattle metro.
export const MAP_CENTER: [number, number] = [-122.33, 47.64];
export const MAP_ZOOM = 10.2;

// Default region when none is chosen (also the URL-serialization default).
export const DEFAULT_STATE = "WA";

// Default work location the commute isochrone starts from. Users can move it by
// dragging the pin or clicking the map.
export interface WorkLocation {
  lat: number;
  lon: number;
}
export const DEFAULT_WORK: WorkLocation = { lat: 47.518, lon: -122.2966 }; // Museum of Flight, Seattle

// Sequential ramp keyed on median home value (USD). Ascending stops; cool->deep
// reads as "more expensive". Shared by the map fill and the legend swatches.
export interface ColorStop {
  value: number;
  color: string;
}

// Breaks chosen to spread the bulk of the metro (most ZIPs fall 450k–1.8M);
// values above the top stop clamp to the darkest color.
export const COLOR_STOPS: ColorStop[] = [
  { value: 450_000, color: "#c6dbef" },
  { value: 700_000, color: "#9ecae1" },
  { value: 950_000, color: "#6baed6" },
  { value: 1_300_000, color: "#3182bd" },
  { value: 1_800_000, color: "#08519c" },
];

// Diverging ramp for year-over-year % change, centered on 0 (red = falling,
// green = rising), clamped to ±6% so the metro's mid-range stays legible.
export const YOY_STOPS: ColorStop[] = [
  { value: -6, color: "#d73027" },
  { value: -3, color: "#fc8d59" },
  { value: 0, color: "#ffffbf" },
  { value: 3, color: "#91cf60" },
  { value: 6, color: "#1a9850" },
];

// Sequential ramp for sold price per square foot ($). Breaks spread the metro
// (most ZIPs ~$200–$700/sqft; a few enclaves clamp to the top).
export const PPSF_STOPS: ColorStop[] = [
  { value: 200, color: "#f2f0f7" },
  { value: 350, color: "#cbc9e2" },
  { value: 500, color: "#9e9ac8" },
  { value: 700, color: "#756bb1" },
  { value: 1000, color: "#54278f" },
];

// ZIPs with no value in the dataset.
export const NO_DATA_COLOR = "#d9d9d9";

// Ramp colors (sequential). Break VALUES are computed at runtime from each
// region's distribution (quantiles) so a cheap state and a pricey state both
// spread across the full ramp — a fixed nationwide scale would wash most out.
export const VALUE_COLORS = COLOR_STOPS.map((s) => s.color);
export const PPSF_COLORS = PPSF_STOPS.map((s) => s.color);

// The metrics the choropleth can shade by. `property` is the GeoJSON feature
// property; `fixedStops` (YoY only — a comparable % scale) overrides the
// per-region quantile breaks. `format` labels legend boundaries.
export type MetricKey = "value" | "yoy" | "ppsf";

export interface MetricDef {
  key: MetricKey;
  label: string; // full label (legend title, a11y)
  short: string; // compact label for the switcher button
  property: string;
  colors: string[];
  diverging: boolean;
  format: (value: number) => string;
  fixedStops?: ColorStop[]; // when set, skip per-region quantile breaks
}

export const METRICS: MetricDef[] = [
  {
    key: "value",
    label: "Median value",
    short: "Value",
    property: "median_value",
    colors: VALUE_COLORS,
    diverging: false,
    format: formatUsdCompact,
  },
  {
    key: "yoy",
    label: "YoY change",
    short: "YoY",
    property: "yoy_pct",
    colors: YOY_STOPS.map((s) => s.color),
    diverging: true,
    format: formatPct,
    fixedStops: YOY_STOPS,
  },
  {
    key: "ppsf",
    label: "$/sqft",
    short: "$/sqft",
    property: "ppsf",
    colors: PPSF_COLORS,
    diverging: false,
    format: formatPpsf,
  },
];

// Opacity applied to over-budget ZIPs vs. in-budget ZIPs (R4 de-emphasis).
export const OVER_BUDGET_OPACITY = 0.15;
export const IN_BUDGET_OPACITY = 0.85;

// Commute isochrone overlay — outline-only; each time-of-day scenario gets a
// distinct outline color (spec 003).
export const WORK_MARKER_COLOR = "#e64a19";

// Selectable commute times (min). Mapbox isochrones cap at 60.
export const COMMUTE_STEPS = [15, 30, 45, 60] as const;
export const DEFAULT_MINUTES = 30;

// Departure scenarios, outer (widest reach) -> inner. Keys match the backend
// `scenario` property; order drives the legend.
export interface ScenarioStyle {
  key: "offpeak" | "typical" | "peak";
  label: string;
  line: string;
}
export const SCENARIO_STYLES: ScenarioStyle[] = [
  { key: "offpeak", label: "Light traffic", line: "#2e7d32" },
  { key: "typical", label: "Midday", line: "#f9a825" },
  { key: "peak", label: "Evening rush", line: "#c62828" },
];
