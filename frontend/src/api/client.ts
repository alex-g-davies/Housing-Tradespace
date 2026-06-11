// Thin fetch wrappers. Every call targets the backend (API_BASE) — never
// api.mapbox.com — so the Mapbox token stays server-side (R5).

import { API_BASE } from "../config";
import type { FeatureCollection } from "geojson";

export interface ZipValue {
  zip: string;
  median_value: number;
  // Enriched metrics (spec 002); null when unavailable.
  yoy_pct: number | null;
  cagr5_pct: number | null;
  ppsf: number | null;
  history: [string, number][] | null;
  // Census ACS context (spec 008); null when unavailable.
  population: number | null;
  median_income: number | null;
  price_to_income: number | null;
  // GeoNames primary place name (spec 012); null when unavailable.
  name: string | null;
}

export interface HousingResponse {
  metro: string;
  currency: string;
  as_of: string;
  zips: ZipValue[];
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const getHousing = (state: string) =>
  getJson<HousingResponse>(`/housing?state=${state}`);

export const getZipsGeojson = (state: string) =>
  getJson<FeatureCollection>(`/zips.geojson?state=${state}`);

export interface RegionInfo {
  code: string;
  name: string;
  bbox: [number, number, number, number] | null;
  center: [number, number] | null;
  zip_count: number;
}

export const getRegions = () => getJson<RegionInfo[]>("/regions");

export const getIsochrone = (lat: number, lon: number, minutes: number) =>
  getJson<FeatureCollection>(`/isochrone?lat=${lat}&lon=${lon}&minutes=${minutes}`);

export interface GeocodeResult {
  lat: number;
  lon: number;
  place_name: string;
}

/** Routed AM/PM commute estimate for a (home, work) pair (spec 011). */
export interface CommuteEstimate {
  am_minutes: number;
  am_depart_local: string;
  pm_minutes: number;
  pm_depart_local: string;
}

/** Routed drive times home->work (AM) and work->home (PM). Throws on any
 * non-OK status — callers treat failures as "no estimate" (best-effort). */
export const getCommute = (from: { lat: number; lon: number }, to: { lat: number; lon: number }) =>
  getJson<CommuteEstimate>(
    `/commute?from_lat=${from.lat}&from_lon=${from.lon}&to_lat=${to.lat}&to_lon=${to.lon}`,
  );

/** Reach-area variation across departure scenarios (spec 003). */
export interface CommuteVariation {
  offpeak_sqmi: number | null;
  typical_sqmi: number | null;
  peak_sqmi: number | null;
  peak_shrink_pct: number | null;
}

/** Forward-geocode an address via the backend, optionally biased toward a
 * point — the selected region's center (010 R3). Throws Error("not_found") on
 * a 404 (no match) so callers can show a friendly message; never calls Mapbox. */
export async function getGeocode(
  q: string,
  proximity?: { lat: number; lon: number },
): Promise<GeocodeResult> {
  let url = `${API_BASE}/geocode?q=${encodeURIComponent(q)}`;
  if (proximity) url += `&proximity_lat=${proximity.lat}&proximity_lon=${proximity.lon}`;
  const res = await fetch(url);
  if (res.status === 404) throw new Error("not_found");
  if (!res.ok) throw new Error(`geocode -> ${res.status}`);
  return (await res.json()) as GeocodeResult;
}
