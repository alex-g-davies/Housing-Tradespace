import { renderHook, waitFor } from "@testing-library/react";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getReverseGeocode } from "../api/client";
import { useReverseGeocode } from "../hooks/useReverseGeocode";

vi.mock("../api/client", () => ({ getReverseGeocode: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("useReverseGeocode (015 R1)", () => {
  it("resolves the address after the debounce", async () => {
    (getReverseGeocode as Mock).mockResolvedValue({
      lat: 47.61,
      lon: -122.33,
      place_name: "401 Pine St, Seattle",
    });
    const { result } = renderHook(() => useReverseGeocode(47.61, -122.33));
    expect(result.current).toBeNull();
    vi.advanceTimersByTime(600);
    vi.useRealTimers(); // let the promise settle
    await waitFor(() => expect(result.current).toBe("401 Pine St, Seattle"));
  });

  it("uses the seed label without fetching", () => {
    const { result } = renderHook(() => useReverseGeocode(47.61, -122.33, "Pike Place Market"));
    expect(result.current).toBe("Pike Place Market");
    vi.advanceTimersByTime(1000);
    expect(getReverseGeocode).not.toHaveBeenCalled();
  });

  it("clears and skips fetching for null coordinates", () => {
    const { result } = renderHook(() => useReverseGeocode(null, null));
    expect(result.current).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(getReverseGeocode).not.toHaveBeenCalled();
  });
});
