import { describe, expect, it } from "vitest";

import type { RegionInfo } from "../api/client";
import { regionForPoint } from "../lib/locateRegion";

function region(
  code: string,
  bbox: [number, number, number, number] | null,
  center: [number, number] | null,
): RegionInfo {
  return { code, name: code, bbox, center, zip_count: 1 };
}

// bbox order: [west, south, east, north]; center: [lon, lat]
const CO = region("CO", [-109, 37, -102, 41], [-105.5, 39]);
const WY = region("WY", [-111, 41, -104, 45], [-107.5, 43]);
// Overlapping pair (DC sits inside MD's bbox in real data).
const MD = region("MD", [-79.5, 37.9, -75, 39.7], [-77.2, 39.0]);
const DC = region("DC", [-77.12, 38.79, -76.91, 38.996], [-77.02, 38.9]);

describe("regionForPoint (010 R1)", () => {
  it("finds the containing region", () => {
    expect(regionForPoint(39.74, -104.99, [CO, WY])?.code).toBe("CO"); // Denver
    expect(regionForPoint(43.07, -107.29, [CO, WY])?.code).toBe("WY");
  });

  it("breaks bbox overlaps by distance to center", () => {
    // Downtown Washington DC is inside BOTH bboxes; DC's center is closer.
    expect(regionForPoint(38.9, -77.03, [MD, DC])?.code).toBe("DC");
    // Baltimore is inside MD only.
    expect(regionForPoint(39.29, -76.61, [MD, DC])?.code).toBe("MD");
  });

  it("returns null outside every region", () => {
    expect(regionForPoint(48.85, 2.35, [CO, WY, MD, DC])).toBeNull(); // Paris
  });

  it("tolerates null bbox and null center", () => {
    const noBbox = region("XX", null, [-100, 40]);
    const noCenter = region("CO", [-109, 37, -102, 41], null);
    expect(regionForPoint(39.74, -104.99, [noBbox, noCenter])?.code).toBe("CO");
  });
});
