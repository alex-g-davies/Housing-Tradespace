import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useGeolocate } from "../hooks/useGeolocate";

type SuccessCb = (pos: { coords: { latitude: number; longitude: number } }) => void;
type ErrorCb = () => void;

function stubGeolocation(impl: (ok: SuccessCb, err: ErrorCb) => void) {
  vi.stubGlobal("navigator", {
    geolocation: { getCurrentPosition: vi.fn(impl) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useGeolocate (010 R1)", () => {
  it("resolves to the fix on success", async () => {
    stubGeolocation((ok) => ok({ coords: { latitude: 39.74, longitude: -104.99 } }));
    const { result } = renderHook(() => useGeolocate(true));
    await waitFor(() => expect(result.current).toEqual({ lat: 39.74, lon: -104.99 }));
  });

  it("stays null on error", async () => {
    stubGeolocation((_ok, err) => err());
    const { result } = renderHook(() => useGeolocate(true));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toBeNull();
  });

  it("does nothing when disabled", () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    const { result } = renderHook(() => useGeolocate(false));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("stays null when geolocation is unsupported", () => {
    vi.stubGlobal("navigator", {});
    const { result } = renderHook(() => useGeolocate(true));
    expect(result.current).toBeNull();
  });
});
