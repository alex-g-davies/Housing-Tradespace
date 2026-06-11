import { useEffect, useState } from "react";

import { type CommuteEstimate, getCommute } from "../api/client";
import type { WorkLocation } from "../config";
import type { LonLat } from "../lib/geo";

/**
 * Routed commute estimate for the selected ZIP's centroid vs the work pin
 * (spec 011 R3). Debounced ~300 ms so dragging the pin with a panel open
 * can't burst the upstream rate limit; best-effort — any failure resolves to
 * null and the panel simply omits the lines.
 */
export function useCommute(home: LonLat | null, work: WorkLocation): CommuteEstimate | null {
  const [estimate, setEstimate] = useState<CommuteEstimate | null>(null);

  useEffect(() => {
    setEstimate(null);
    if (!home) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      getCommute({ lat: home[1], lon: home[0] }, { lat: work.lat, lon: work.lon })
        .then((e) => !cancelled && setEstimate(e))
        .catch(() => {
          /* 404/503/network -> no estimate lines (011 R6) */
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [home, work.lat, work.lon]);

  return estimate;
}
