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

/** Reach-area variation across departure scenarios (spec 003). */
export interface CommuteVariation {
  offpeak_sqmi: number | null;
  typical_sqmi: number | null;
  peak_sqmi: number | null;
  peak_shrink_pct: number | null;
}

/** Forward-geocode an address via the backend. Throws Error("not_found") on a
 * 404 (no match) so callers can show a friendly message; never calls Mapbox. */
export async function getGeocode(q: string): Promise<GeocodeResult> {
  const res = await fetch(`${API_BASE}/geocode?q=${encodeURIComponent(q)}`);
  if (res.status === 404) throw new Error("not_found");
  if (!res.ok) throw new Error(`geocode -> ${res.status}`);
  return (await res.json()) as GeocodeResult;
}
