import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";

import { type ZipValue, getHousing, getZipsGeojson } from "../api/client";

export interface MapData {
  geojson: FeatureCollection | null;
  records: Map<string, ZipValue>;
  loading: boolean;
  error: string | null;
  /** Non-blocking degradations to surface as toasts (005 R2). */
  notices: string[];
}

const EMPTY: Map<string, ZipValue> = new Map();

export const NOTICE_RECORDS = "ZIP details unavailable — popups will be limited";

/**
 * Loads the choropleth geometry and the per-ZIP records per state (the records
 * power popups, the panel, and the ramps). The choropleth is the critical
 * layer; records are best-effort with a toast on failure. Reach overlays
 * moved to useIsochrone (016 — fetched per work pin).
 */
export function useMapData(state: string): MapData {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [records, setRecords] = useState<Map<string, ZipValue>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordsFailed, setRecordsFailed] = useState(false);

  // Choropleth geometry — refetched when the selected state changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getZipsGeojson(state)
      .then((fc) => !cancelled && (setGeojson(fc), setError(null)))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [state]);

  // Per-ZIP enriched records (for popups + adaptive ramps) — refetched per state.
  useEffect(() => {
    let cancelled = false;
    getHousing(state)
      .then((h) => {
        if (cancelled) return;
        setRecords(new Map(h.zips.map((z) => [z.zip, z])));
        setRecordsFailed(false);
      })
      .catch(() => !cancelled && setRecordsFailed(true));
    return () => {
      cancelled = true;
    };
  }, [state]);

  const notices: string[] = [];
  if (recordsFailed) notices.push(NOTICE_RECORDS);

  return { geojson, records, loading, error, notices };
}
