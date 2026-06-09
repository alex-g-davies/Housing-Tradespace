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

export const getHousing = () => getJson<HousingResponse>("/housing");

export const getZipsGeojson = () => getJson<FeatureCollection>("/zips.geojson");

export const getIsochrone = (lat: number, lon: number) =>
  getJson<FeatureCollection>(`/isochrone?lat=${lat}&lon=${lon}`);

export interface GeocodeResult {
  lat: number;
  lon: number;
  place_name: string;
}

/** Forward-geocode an address via the backend. Throws Error("not_found") on a
 * 404 (no match) so callers can show a friendly message; never calls Mapbox. */
export async function getGeocode(q: string): Promise<GeocodeResult> {
  const res = await fetch(`${API_BASE}/geocode?q=${encodeURIComponent(q)}`);
  if (res.status === 404) throw new Error("not_found");
  if (!res.ok) throw new Error(`geocode -> ${res.status}`);
  return (await res.json()) as GeocodeResult;
}
