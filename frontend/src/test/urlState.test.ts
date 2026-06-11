import { describe, expect, it } from "vitest";

import { parseAppUrl, serializeAppUrl } from "../lib/urlState";
import { DEFAULT_MINUTES, DEFAULT_WORK } from "../config";

const DEFAULTS = {
  state: "WA",
  zip: null,
  budget: 0,
  work: DEFAULT_WORK,
  minutes: DEFAULT_MINUTES,
  metric: "value" as const,
  tmode: "drive" as const,
};

describe("urlState (009 R5)", () => {
  it("round-trips a full state", () => {
    const input = {
      state: "CO",
      zip: "80302",
      budget: 600000,
      work: { lat: 39.7392, lon: -104.9903 },
      minutes: 45,
      metric: "yoy" as const,
      tmode: "walk" as const,
    };
    const qs = serializeAppUrl(input);
    const parsed = parseAppUrl(qs);
    expect(parsed.state).toBe("CO");
    expect(parsed.zip).toBe("80302");
    expect(parsed.budget).toBe(600000);
    expect(parsed.work).toEqual({ lat: 39.7392, lon: -104.9903 });
    expect(parsed.minutes).toBe(45);
    expect(parsed.metric).toBe("yoy");
    expect(parsed.tmode).toBe("walk");
  });

  it("serializes defaults to an empty string", () => {
    expect(serializeAppUrl(DEFAULTS)).toBe("");
  });

  it("drops invalid params silently", () => {
    const parsed = parseAppUrl(
      "?state=Colorado&zip=1234&budget=-5&lat=99&lon=-104&min=37&metric=bogus",
    );
    expect(parsed).toEqual({});
  });

  it("requires lat and lon together", () => {
    expect(parseAppUrl("?lat=39.7").work).toBeUndefined();
    expect(parseAppUrl("?lon=-104.9").work).toBeUndefined();
  });

  it("normalizes state case", () => {
    expect(parseAppUrl("?state=co").state).toBe("CO");
  });

  it("round-trips the affordability metric (014 R3)", () => {
    expect(parseAppUrl("?metric=afford").metric).toBe("afford");
    expect(serializeAppUrl({ ...DEFAULTS, metric: "afford" })).toBe("?metric=afford");
  });

  it("round-trips travel mode, omitting the drive default (013 R5)", () => {
    expect(parseAppUrl("?tmode=cycle").tmode).toBe("cycle");
    expect(parseAppUrl("?tmode=jetpack").tmode).toBeUndefined();
    expect(serializeAppUrl({ ...DEFAULTS, tmode: "walk" })).toBe("?tmode=walk");
    expect(serializeAppUrl(DEFAULTS)).toBe("");
  });

  it("keeps leading-zero ZIPs", () => {
    expect(parseAppUrl("?zip=05001").zip).toBe("05001");
  });
});
