import { describe, expect, it } from "vitest";

import { formatPct, formatPpsf, formatUsd, formatUsdCompact } from "../lib/format";

describe("format", () => {
  it("formats full currency with thousands separators", () => {
    expect(formatUsd(937500)).toBe("$937,500");
    expect(formatUsd(1250000)).toBe("$1,250,000");
  });

  it("formats compact currency in thousands", () => {
    expect(formatUsdCompact(937500)).toBe("$938k");
    expect(formatUsdCompact(450000)).toBe("$450k");
  });

  it("formats signed percent to one decimal", () => {
    expect(formatPct(4.2)).toBe("+4.2%");
    expect(formatPct(-1.5)).toBe("-1.5%");
    expect(formatPct(0)).toBe("0.0%");
  });

  it("formats price per square foot", () => {
    expect(formatPpsf(612)).toBe("$612/sqft");
    expect(formatPpsf(611.6)).toBe("$612/sqft");
  });
});
