// Dual-workplace reach intersection (spec 016 R2/R5). Pure: takes two
// isochrone FeatureCollections from the per-pin endpoint, intersects bands
// with MATCHING scenarios, and returns a collection the existing band
// styling/reach-check/legend consume unchanged.

import area from "@turf/area";
import intersect from "@turf/intersect";
import { featureCollection } from "@turf/helpers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

import type { CommuteVariation } from "../api/client";

const SQM_PER_SQMI = 2_589_988.110336;

export interface IsochroneIntersection {
  collection: FeatureCollection;
  variation: CommuteVariation | null;
  /** True when no band survived — nowhere is inside both commutes. */
  empty: boolean;
}

type Band = Feature<Polygon | MultiPolygon>;

function scenarioOf(f: Feature): string {
  return ((f.properties as { scenario?: string } | null)?.scenario ?? "") as string;
}

function isPolygonal(f: Feature): f is Band {
  return f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon";
}

/** Intersect matching scenario bands of two isochrones (016 R2). Output
 * features keep scenario/label/contour_minutes so downstream code (band
 * colors, scenariosContaining, areas) works untouched; `area_sqmi` is
 * recomputed for the intersection geometry. */
export function intersectIsochrones(
  a: FeatureCollection,
  b: FeatureCollection,
): IsochroneIntersection {
  const bByScenario = new Map<string, Band>();
  for (const f of b.features) {
    if (isPolygonal(f)) bByScenario.set(scenarioOf(f), f);
  }

  const features: Feature[] = [];
  const areas: Record<string, number> = {};
  for (const fa of a.features) {
    if (!isPolygonal(fa)) continue;
    const scenario = scenarioOf(fa);
    const fb = bByScenario.get(scenario);
    if (!fb) continue;
    const clipped = intersect(featureCollection<Polygon | MultiPolygon>([fa, fb]));
    if (!clipped) continue; // disjoint for this scenario
    const sqmi = Math.round((area(clipped) / SQM_PER_SQMI) * 10) / 10;
    clipped.properties = { ...(fa.properties ?? {}), area_sqmi: sqmi };
    features.push(clipped);
    areas[scenario] = sqmi;
  }

  const off = areas["offpeak"] ?? null;
  const peak = areas["peak"] ?? null;
  const variation: CommuteVariation | null =
    Object.keys(areas).length > 1
      ? {
          offpeak_sqmi: off,
          typical_sqmi: areas["typical"] ?? null,
          peak_sqmi: peak,
          peak_shrink_pct:
            off && peak && off > 0 ? Math.round(((off - peak) / off) * 1000) / 10 : null,
        }
      : null;

  return {
    collection: {
      type: "FeatureCollection",
      features,
    },
    variation,
    empty: features.length === 0,
  };
}
