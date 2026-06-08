import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";

import { getIsochrone, getZipsGeojson } from "../api/client";
import type { WorkLocation } from "../config";

export interface MapData {
  geojson: FeatureCollection | null;
  isochrone: FeatureCollection | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads the choropleth geometry once, and (re)loads the commute isochrone
 * whenever the work location changes. The choropleth is the critical layer, so
 * its failure surfaces as an error; the isochrone is best-effort (the backend
 * may be in fixture mode or upstream may be down) and stays null on failure.
 */
export function useMapData(work: WorkLocation): MapData {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [isochrone, setIsochrone] = useState<FeatureCollection | null>(null);
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

  return { geojson, isochrone, loading, error };
}
