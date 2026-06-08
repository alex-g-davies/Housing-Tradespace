// Thin fetch wrappers. Every call targets the backend (API_BASE) — never
// api.mapbox.com — so the Mapbox token stays server-side (R5).

import { API_BASE } from "../config";
import type { FeatureCollection } from "geojson";

export interface ZipValue {
  zip: string;
  median_value: number;
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

export const getIsochrone = () => getJson<FeatureCollection>("/isochrone");
