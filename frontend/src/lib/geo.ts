// Minimal planar geometry over GeoJSON (spec 009 R3/R6) — centroids for
// fly-to targets and point-in-polygon for the commute-reach check. Planar
// math is fine at ZIP scale; no turf dependency.

import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

export type LonLat = [number, number];

/** Signed shoelace area of a ring (planar, degrees²). */
function ringArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}

/** Area-weighted centroid of a ring; falls back to the vertex mean for
 * degenerate (zero-area) rings. */
export function ringCentroid(ring: Position[]): LonLat | null {
  if (ring.length < 3) return null;
  const a = ringArea(ring);
  if (Math.abs(a) < 1e-12) {
    let mx = 0;
    let my = 0;
    for (const [x, y] of ring) {
      mx += x;
      my += y;
    }
    return [mx / ring.length, my / ring.length];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    cx += (ring[i][0] + ring[i + 1][0]) * f;
    cy += (ring[i][1] + ring[i + 1][1]) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

type AreaFeature = Feature<Polygon | MultiPolygon> | Feature;

function outerRings(feature: AreaFeature): Position[][] {
  const geom = feature.geometry;
  if (!geom) return [];
  if (geom.type === "Polygon") return geom.coordinates.length ? [geom.coordinates[0]] : [];
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.filter((p) => p.length).map((p) => p[0]);
  }
  return [];
}

/** Centroid of the feature's largest outer ring (a sane "center" even for
 * island ZIPs rendered as MultiPolygons). */
export function featureCentroid(feature: AreaFeature): LonLat | null {
  const rings = outerRings(feature);
  if (rings.length === 0) return null;
  let best = rings[0];
  let bestArea = Math.abs(ringArea(rings[0]));
  for (const ring of rings.slice(1)) {
    const a = Math.abs(ringArea(ring));
    if (a > bestArea) {
      best = ring;
      bestArea = a;
    }
  }
  return ringCentroid(best);
}

/** One centroid per ZIP, computed once per loaded choropleth. */
export function centroidsByZip(fc: FeatureCollection | null): Map<string, LonLat> {
  const out = new Map<string, LonLat>();
  if (!fc) return out;
  for (const feature of fc.features) {
    const zip = (feature.properties as { zip?: string } | null)?.zip;
    if (!zip || out.has(zip)) continue;
    const c = featureCentroid(feature);
    if (c) out.set(zip, c);
  }
  return out;
}

/** Even-odd ray cast: is the point inside the ring? */
function pointInRing([x, y]: LonLat, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Point-in-feature for Polygon/MultiPolygon, honoring holes. */
export function pointInPolygonFeature(point: LonLat, feature: AreaFeature): boolean {
  const geom = feature.geometry;
  if (!geom) return false;
  const polys =
    geom.type === "Polygon"
      ? [geom.coordinates]
      : geom.type === "MultiPolygon"
        ? geom.coordinates
        : [];
  for (const poly of polys) {
    if (poly.length === 0 || !pointInRing(point, poly[0])) continue;
    const inHole = poly.slice(1).some((hole) => pointInRing(point, hole));
    if (!inHole) return true;
  }
  return false;
}
