// Map a geolocated point to a loadable region (spec 010 R1). Pure.

import type { RegionInfo } from "../api/client";

/** The region whose bbox contains the point. State bboxes overlap heavily
 * (MD/VA/WV/DC), so ties break by squared distance to the region center with
 * cos(lat) longitude scaling; null when no bbox contains the point. */
export function regionForPoint(
  lat: number,
  lon: number,
  regions: RegionInfo[],
): RegionInfo | null {
  const containing = regions.filter((r) => {
    if (!r.bbox) return false;
    const [west, south, east, north] = r.bbox;
    return south <= lat && lat <= north && west <= lon && lon <= east;
  });
  if (containing.length === 0) return null;

  const lonScale = Math.cos((lat * Math.PI) / 180);
  let best: RegionInfo | null = null;
  let bestDist = Infinity;
  for (const r of containing) {
    const [cLon, cLat] = r.center ?? [
      (r.bbox![0] + r.bbox![2]) / 2,
      (r.bbox![1] + r.bbox![3]) / 2,
    ];
    const dLat = lat - cLat;
    const dLon = (lon - cLon) * lonScale;
    const dist = dLat * dLat + dLon * dLon;
    if (dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  }
  return best;
}
