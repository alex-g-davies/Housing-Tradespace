import { afterEach, describe, expect, it, vi } from "vitest";

import { getHousing, getIsochrone, getZipsGeojson } from "../api/client";

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
    await getIsochrone();
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(["/api/housing", "/api/zips.geojson", "/api/isochrone"]);
    for (const url of urls) {
      expect(url).not.toContain("mapbox");
      expect(url).not.toContain("access_token");
    }
  });
});
