import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";

import { type ZipValue, getHousing, getIsochrone, getZipsGeojson } from "../api/client";
import type { WorkLocation } from "../config";

export interface MapData {
  geojson: FeatureCollection | null;
  isochrone: FeatureCollection | null;
  records: Map<string, ZipValue>;
  loading: boolean;
  error: string | null;
}

const EMPTY: Map<string, ZipValue> = new Map();

/**
 * Loads the choropleth geometry and the per-ZIP records once (the records power
 * the hover popup's enriched metrics + sparkline), and (re)loads the commute
 * isochrone whenever the work location changes. The choropleth is the critical
 * layer; the isochrone is best-effort.
 */
export function useMapData(work: WorkLocation): MapData {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [isochrone, setIsochrone] = useState<FeatureCollection | null>(null);
  const [records, setRecords] = useState<Map<string, ZipValue>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Choropleth geometry — fetched once.
  useEffect(() => {
    let cancelled = false;
    getZipsGeojson()
      .then((fc) => !cancelled && setGeojson(fc))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-ZIP enriched records (for popups) — fetched once.
  useEffect(() => {
    let cancelled = false;
    getHousing()
      .then((h) => !cancelled && setRecords(new Map(h.zips.map((z) => [z.zip, z]))))
      .catch(() => {
        /* popups degrade to geometry-only if this fails */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Commute isochrone — refetched when the work location moves.
  useEffect(() => {
    let cancelled = false;
    getIsochrone(work.lat, work.lon)
      .then((fc) => !cancelled && setIsochrone(fc))
      .catch(() => {
        /* isochrone is best-effort; ignore failures */
      });
    return () => {
      cancelled = true;
    };
  }, [work.lat, work.lon]);

  return { geojson, isochrone, records, loading, error };
}
