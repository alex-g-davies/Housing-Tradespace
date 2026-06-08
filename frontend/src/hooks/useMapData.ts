import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";

import { getIsochrone, getZipsGeojson } from "../api/client";

export interface MapData {
  geojson: FeatureCollection | null;
  isochrone: FeatureCollection | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads the choropleth geometry and the commute isochrone in parallel. The
 * choropleth is the critical layer, so its failure surfaces as an error; the
 * isochrone is best-effort (the backend may be in fixture mode or upstream may
 * be down) and simply stays null without blocking the map.
 */
export function useMapData(): MapData {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [isochrone, setIsochrone] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Fire both requests at once; render the choropleth as soon as it arrives.
    getZipsGeojson()
      .then((fc) => !cancelled && setGeojson(fc))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));

    getIsochrone()
      .then((fc) => !cancelled && setIsochrone(fc))
      .catch(() => {
        /* isochrone is best-effort; ignore failures */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { geojson, isochrone, loading, error };
}
