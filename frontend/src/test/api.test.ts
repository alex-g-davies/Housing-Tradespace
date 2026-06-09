import { afterEach, describe, expect, it, vi } from "vitest";

import { getGeocode, getHousing, getIsochrone, getZipsGeojson } from "../api/client";

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
    await getHousing();
    await getZipsGeojson();
    await getIsochrone(47.518, -122.2966);
    await getGeocode("Pike Place Market");
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toBe("/api/housing");
    expect(urls[1]).toBe("/api/zips.geojson");
    // Isochrone carries only the work lat/lon — never a Mapbox token.
    expect(urls[2]).toBe("/api/isochrone?lat=47.518&lon=-122.2966");
    // Geocoding goes through the backend with the query encoded.
    expect(urls[3]).toBe("/api/geocode?q=Pike%20Place%20Market");
    for (const url of urls) {
      expect(url).not.toContain("mapbox");
      expect(url).not.toContain("access_token");
    }
  });
});
