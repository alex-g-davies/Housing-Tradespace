import { useEffect, useRef, useState } from "react";

import { getReverseGeocode } from "../api/client";

/**
 * Nearest address for a pin position (015 R1). Debounced ~500 ms against pin
 * nudges; best-effort (null on miss/failure). A `seed` label — e.g. the
 * place_name an address search just returned — displays instantly and
 * suppresses the redundant round trip for that position.
 */
export function useReverseGeocode(
  lat: number | null,
  lon: number | null,
  seed?: string | null,
): string | null {
  const [address, setAddress] = useState<string | null>(null);
  const seedRef = useRef<string | null>(null);
  seedRef.current = seed ?? null;

  useEffect(() => {
    if (lat == null || lon == null) {
      setAddress(null);
      return;
    }
    if (seedRef.current) {
      setAddress(seedRef.current);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      getReverseGeocode(lat, lon)
        .then((r) => !cancelled && setAddress(r?.place_name ?? null))
        .catch(() => !cancelled && setAddress(null));
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [lat, lon]);

  return address;
}
