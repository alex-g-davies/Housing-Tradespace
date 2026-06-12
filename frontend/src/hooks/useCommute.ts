import { useEffect, useState } from "react";

import { type CommuteEstimate, getCommute } from "../api/client";
import type { TravelMode, WorkLocation } from "../config";
import type { LonLat } from "../lib/geo";

export interface CommuteState {
  estimate: CommuteEstimate | null;
  /** True while a fetch is in flight (013 R3 — the panel shows it). */
  loading: boolean;
}

/**
 * Routed commute estimate for the selected ZIP's centroid vs the work pin
 * (spec 013). Debounced ~300 ms so dragging the pin with a panel open can't
 * burst the upstream rate limit; best-effort — any failure resolves to a null
 * estimate and the panel simply omits the lines.
 */
export function useCommute(
  home: LonLat | null,
  work: WorkLocation | null,
  mode: TravelMode,
): CommuteState {
  const [estimate, setEstimate] = useState<CommuteEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEstimate(null);
    if (!home || !work) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      getCommute({ lat: home[1], lon: home[0] }, { lat: work.lat, lon: work.lon }, mode)
        .then((e) => !cancelled && setEstimate(e))
        .catch(() => {
          /* 404/503/network -> no estimate lines (013 R3/R6) */
        })
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      setLoading(false);
    };
  }, [home, work?.lat, work?.lon, mode, work]);

  return { estimate, loading };
}
