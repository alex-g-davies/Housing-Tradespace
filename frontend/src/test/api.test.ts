import { afterEach, describe, expect, it, vi } from "vitest";

import { getCommute, getGeocode, getHousing, getIsochrone, getZipsGeojson } from "../api/client";

function mockFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client (R5 — token never client-side)", () => {
  it("calls the backend, never api.mapbox.com", async () => {
    const f = mockFetch();
    await getHousing("WA");
    await getZipsGeojson("WA");
    await getIsochrone(47.518, -122.2966, 30);
    await getGeocode("Pike Place Market");
    await getGeocode("Main St", { lat: 31.2, lon: -99.3 });
    await getCommute({ lat: 47.33, lon: -122.58 }, { lat: 47.518, lon: -122.2966 });
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toBe("/api/housing?state=WA");
    expect(urls[1]).toBe("/api/zips.geojson?state=WA");
    // Isochrone carries only the work lat/lon/minutes — never a Mapbox token.
    expect(urls[2]).toBe("/api/isochrone?lat=47.518&lon=-122.2966&minutes=30");
    // Geocoding goes through the backend with the query encoded; the optional
    // proximity bias (010 R3) carries only region-center coordinates.
    expect(urls[3]).toBe("/api/geocode?q=Pike%20Place%20Market");
    expect(urls[4]).toBe("/api/geocode?q=Main%20St&proximity_lat=31.2&proximity_lon=-99.3");
    // Commute estimate (011): coordinate pairs only, never a token.
    expect(urls[5]).toBe(
      "/api/commute?from_lat=47.33&from_lon=-122.58&to_lat=47.518&to_lon=-122.2966",
    );
    for (const url of urls) {
      expect(url).not.toContain("mapbox");
      expect(url).not.toContain("access_token");
    }
  });
});
