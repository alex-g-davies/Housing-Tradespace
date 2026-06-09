import { describe, expect, it } from "vitest";

import { formatUsd, formatUsdCompact } from "../lib/format";

describe("format", () => {
  it("formats full currency with thousands separators", () => {
    expect(formatUsd(937500)).toBe("$937,500");
    expect(formatUsd(1250000)).toBe("$1,250,000");
  });

  it("formats compact currency in thousands", () => {
    expect(formatUsdCompact(937500)).toBe("$938k");
    expect(formatUsdCompact(450000)).toBe("$450k");
  });
});
