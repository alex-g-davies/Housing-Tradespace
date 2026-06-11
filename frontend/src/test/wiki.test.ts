import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearWikiMemo, fetchWikiSummary, wikiTitleCandidates } from "../lib/wiki";

const STANDARD = {
  type: "standard",
  extract: "Gig Harbor is a city in Pierce County, Washington.",
  thumbnail: { source: "https://upload.wikimedia.org/thumb.jpg" },
  content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Gig_Harbor,_Washington" } },
};

function mockFetch(impl: (url: string) => { status: number; body?: unknown }) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      const { status, body } = impl(String(url));
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      };
    }),
  );
  return calls;
}

beforeEach(() => clearWikiMemo());
afterEach(() => vi.unstubAllGlobals());

describe("wiki (012 R3/R4)", () => {
  it("orders title candidates most-specific first", () => {
    expect(wikiTitleCandidates("Gig Harbor", "Washington")).toEqual([
      "Gig Harbor, Washington",
      "Gig Harbor",
    ]);
    expect(wikiTitleCandidates("Gig Harbor", null)).toEqual(["Gig Harbor"]);
  });

  it("returns the first standard page", async () => {
    mockFetch(() => ({ status: 200, body: STANDARD }));
    const s = await fetchWikiSummary(["Gig Harbor, Washington"]);
    expect(s?.extract).toContain("Pierce County");
    expect(s?.thumbnailUrl).toContain("thumb.jpg");
    expect(s?.pageUrl).toContain("wikipedia.org");
  });

  it("skips 404s and disambiguation pages, falling through candidates", async () => {
    const calls = mockFetch((url) => {
      if (url.includes("Springfield%2C%20Ohio")) return { status: 404 };
      if (url.includes("Springfield")) return { status: 200, body: { type: "disambiguation" } };
      return { status: 404 };
    });
    const s = await fetchWikiSummary(["Springfield, Ohio", "Springfield"]);
    expect(s).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("memoizes results including misses", async () => {
    const calls = mockFetch(() => ({ status: 404 }));
    await fetchWikiSummary(["Nowhere, Kansas"]);
    await fetchWikiSummary(["Nowhere, Kansas"]);
    expect(calls).toHaveLength(1);
  });
});
