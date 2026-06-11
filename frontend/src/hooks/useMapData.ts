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
  /** Non-blocking degradations to surface as toasts (005 R2). */
  notices: string[];
}

const EMPTY: Map<string, ZipValue> = new Map();

export const NOTICE_RECORDS = "ZIP details unavailable — popups will be limited";
export const NOTICE_ISOCHRONE = "Commute layer unavailable — move the pin or retry later";

/**
 * Loads the choropleth geometry and the per-ZIP records once (the records power
 * the hover popup's enriched metrics + sparkline), and (re)loads the commute
 * isochrone whenever the work location changes. The choropleth is the critical
 * layer; the records and isochrone are best-effort but their failures are
 * surfaced as notices instead of being silently swallowed.
 */
export function useMapData(state: string, work: WorkLocation, minutes: number): MapData {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [isochrone, setIsochrone] = useState<FeatureCollection | null>(null);
  const [records, setRecords] = useState<Map<string, ZipValue>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordsFailed, setRecordsFailed] = useState(false);
  const [isoFailed, setIsoFailed] = useState(false);

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

  // Commute isochrone — refetched when the work location or commute time changes.
  useEffect(() => {
    let cancelled = false;
    getIsochrone(work.lat, work.lon, minutes)
      .then((fc) => {
        if (cancelled) return;
        setIsochrone(fc);
        setIsoFailed(false);
      })
      .catch(() => !cancelled && setIsoFailed(true));
    return () => {
      cancelled = true;
    };
  }, [work.lat, work.lon, minutes]);

  const notices: string[] = [];
  if (recordsFailed) notices.push(NOTICE_RECORDS);
  if (isoFailed) notices.push(NOTICE_ISOCHRONE);

  return { geojson, isochrone, records, loading, error, notices };
}
