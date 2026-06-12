import { describe, expect, it } from "vitest";
import type { Feature, FeatureCollection } from "geojson";

import { intersectIsochrones } from "../lib/intersect";

function band(scenario: string, coords: number[][][], label = scenario): Feature {
  return {
    type: "Feature",
    properties: { scenario, label, contour_minutes: 30, area_sqmi: 999 },
    geometry: { type: "Polygon", coordinates: coords },
  };
}

// Two ~111km-side squares (1 degree at the equator) offset by half a degree:
// their overlap is a 0.5x1 degree rectangle.
const SQ_A = [
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ],
];
const SQ_B = [
  [
    [0.5, 0],
    [1.5, 0],
    [1.5, 1],
    [0.5, 1],
    [0.5, 0],
  ],
];
const FAR = [
  [
    [10, 10],
    [11, 10],
    [11, 11],
    [10, 11],
    [10, 10],
  ],
];

function fc(...features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

describe("intersectIsochrones (016 R2/R5)", () => {
  it("intersects matching scenarios and recomputes areas", () => {
    const a = fc(band("offpeak", SQ_A), band("peak", SQ_A));
    const b = fc(band("offpeak", SQ_B), band("peak", SQ_B));
    const out = intersectIsochrones(a, b);
    expect(out.empty).toBe(false);
    expect(out.collection.features).toHaveLength(2);
    const props = out.collection.features[0].properties as Record<string, unknown>;
    expect(props.scenario).toBe("offpeak");
    expect(props.contour_minutes).toBe(30);
    // Overlap = 0.5 x 1 degree at the equator ~ 2,381 sq mi (half of ~4,762).
    const sqmi = props.area_sqmi as number;
    expect(sqmi).toBeGreaterThan(2000);
    expect(sqmi).toBeLessThan(2800);
    expect(sqmi).not.toBe(999); // recomputed, not copied
  });

  it("drops scenarios that are disjoint and flags fully-empty results", () => {
    const partial = intersectIsochrones(
      fc(band("offpeak", SQ_A), band("peak", FAR)),
      fc(band("offpeak", SQ_B), band("peak", SQ_B)),
    );
    expect(partial.collection.features.map((f) => f.properties?.scenario)).toEqual(["offpeak"]);
    expect(partial.empty).toBe(false);

    const none = intersectIsochrones(fc(band("typical", SQ_A)), fc(band("typical", FAR)));
    expect(none.empty).toBe(true);
    expect(none.collection.features).toHaveLength(0);
  });

  it("builds the shared-reach variation from intersection areas", () => {
    const a = fc(band("offpeak", SQ_A), band("typical", SQ_A), band("peak", SQ_A));
    const b = fc(band("offpeak", SQ_B), band("typical", SQ_B), band("peak", SQ_B));
    const { variation } = intersectIsochrones(a, b);
    expect(variation).not.toBeNull();
    // Identical inputs per scenario -> equal areas -> zero shrink.
    expect(variation!.peak_shrink_pct).toBe(0);
  });

  it("single-band modes (walk/cycle) intersect without a variation", () => {
    const out = intersectIsochrones(fc(band("typical", SQ_A)), fc(band("typical", SQ_B)));
    expect(out.collection.features).toHaveLength(1);
    expect(out.variation).toBeNull();
  });
});
