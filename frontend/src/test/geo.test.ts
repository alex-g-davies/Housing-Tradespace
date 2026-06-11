import { describe, expect, it } from "vitest";
import type { Feature, FeatureCollection } from "geojson";

import { centroidsByZip, featureCentroid, pointInPolygonFeature, ringCentroid } from "../lib/geo";

const square: Feature = {
  type: "Feature",
  properties: { zip: "98101" },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ],
    ],
  },
};

const donut: Feature = {
  type: "Feature",
  properties: { zip: "98103" },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ],
  },
};

const multi: Feature = {
  type: "Feature",
  properties: { zip: "96701" },
  geometry: {
    type: "MultiPolygon",
    coordinates: [
      // Small island
      [
        [
          [100, 100],
          [101, 100],
          [101, 101],
          [100, 101],
          [100, 100],
        ],
      ],
      // Main (larger) island — centroid should come from this one
      [
        [
          [0, 0],
          [8, 0],
          [8, 8],
          [0, 8],
          [0, 0],
        ],
      ],
    ],
  },
};

describe("geo (009 R3/R6)", () => {
  it("ringCentroid of a square is its center", () => {
    const ring = (square.geometry as GeoJSON.Polygon).coordinates[0];
    expect(ringCentroid(ring)).toEqual([2, 2]);
  });

  it("featureCentroid uses the largest ring of a MultiPolygon", () => {
    expect(featureCentroid(multi)).toEqual([4, 4]);
  });

  it("centroidsByZip maps every zip once", () => {
    const fc: FeatureCollection = { type: "FeatureCollection", features: [square, multi] };
    const map = centroidsByZip(fc);
    expect(map.get("98101")).toEqual([2, 2]);
    expect(map.get("96701")).toEqual([4, 4]);
    expect(centroidsByZip(null).size).toBe(0);
  });

  it("pointInPolygonFeature: inside, outside, and inside a hole", () => {
    expect(pointInPolygonFeature([2, 2], square)).toBe(true);
    expect(pointInPolygonFeature([5, 5], square)).toBe(false);
    expect(pointInPolygonFeature([1, 1], donut)).toBe(true);
    expect(pointInPolygonFeature([5, 5], donut)).toBe(false); // in the hole
    expect(pointInPolygonFeature([100.5, 100.5], multi)).toBe(true); // small island
  });
});
