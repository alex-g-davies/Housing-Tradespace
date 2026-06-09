// Single source of truth for shared map/legend constants. The color ramp lives
// here so the choropleth and the legend can never drift apart (R2).

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

// ZIPs with no value in the dataset.
export const NO_DATA_COLOR = "#d9d9d9";

// Opacity applied to over-budget ZIPs vs. in-budget ZIPs (R4 de-emphasis).
export const OVER_BUDGET_OPACITY = 0.15;
export const IN_BUDGET_OPACITY = 0.85;

// Commute isochrone overlay — a warm accent that contrasts the cool choropleth.
export const ISOCHRONE_FILL = "#ff7043";
export const ISOCHRONE_LINE = "#e64a19";
