import { useEffect, useState } from "react";

export interface GeoFix {
  lat: number;
  lon: number;
}

/** One-shot browser geolocation (spec 010 R1). Resolves to a fix or stays
 * null on deny/timeout/unsupported/disabled. Low accuracy and a cached fix
 * are fine — we only need the visitor's state. The coordinates never leave
 * the browser except through the existing work-pin flow. */
export function useGeolocate(enabled: boolean): GeoFix | null {
  const [fix, setFix] = useState<GeoFix | null>(null);

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!cancelled) {
          setFix({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        }
      },
      () => {
        /* deny/timeout/unavailable -> stay null; the default region stands */
      },
      { timeout: 6000, maximumAge: 600_000, enableHighAccuracy: false },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return fix;
}
