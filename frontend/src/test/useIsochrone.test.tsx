import { renderHook, waitFor } from "@testing-library/react";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

import { getIsochrone } from "../api/client";
import { useIsochrone } from "../hooks/useIsochrone";

vi.mock("../api/client", () => ({ getIsochrone: vi.fn() }));

const FC = (tag: string) => ({
  type: "FeatureCollection",
  properties: { tag },
  features: [],
});

beforeEach(() => vi.clearAllMocks());

describe("useIsochrone (016 fix)", () => {
  it("fetches for a work location and stays idle for null", async () => {
    (getIsochrone as Mock).mockResolvedValue(FC("a"));
    const { result, rerender } = renderHook(({ work }) => useIsochrone(work, 30, "drive"), {
      initialProps: { work: null as { lat: number; lon: number } | null },
    });
    expect(result.current.isochrone).toBeNull();
    expect(getIsochrone).not.toHaveBeenCalled();

    rerender({ work: { lat: 47.5, lon: -122.3 } });
    await waitFor(() => expect(result.current.isochrone).not.toBeNull());
  });

  it("clears the previous contour immediately when the position changes", async () => {
    let resolveSecond: (v: unknown) => void = () => {};
    (getIsochrone as Mock)
      .mockResolvedValueOnce(FC("first"))
      .mockImplementationOnce(() => new Promise((r) => (resolveSecond = r)));

    const { result, rerender } = renderHook(({ work }) => useIsochrone(work, 30, "drive"), {
      initialProps: { work: { lat: 47.5, lon: -122.3 } },
    });
    await waitFor(() =>
      expect((result.current.isochrone as { properties?: { tag?: string } })?.properties?.tag).toBe(
        "first",
      ),
    );

    // Move the pin: the stale contour must NOT linger while the new fetch is
    // in flight — a stale position would poison the dual-pin intersection.
    rerender({ work: { lat: 47.9, lon: -122.9 } });
    expect(result.current.isochrone).toBeNull();
    expect(result.current.loading).toBe(true);

    resolveSecond(FC("second"));
    await waitFor(() =>
      expect((result.current.isochrone as { properties?: { tag?: string } })?.properties?.tag).toBe(
        "second",
      ),
    );
  });

  it("a failed refetch leaves the contour cleared (no stale geometry)", async () => {
    (getIsochrone as Mock)
      .mockResolvedValueOnce(FC("first"))
      .mockRejectedValueOnce(new Error("429"));
    const { result, rerender } = renderHook(({ work }) => useIsochrone(work, 30, "drive"), {
      initialProps: { work: { lat: 47.5, lon: -122.3 } },
    });
    await waitFor(() => expect(result.current.isochrone).not.toBeNull());

    rerender({ work: { lat: 47.9, lon: -122.9 } });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.isochrone).toBeNull();
  });
});
