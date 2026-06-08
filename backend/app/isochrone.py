"""Mapbox Isochrone client and response shaping.

The token is passed in from settings (config.py) and is used ONLY to build the
outbound Mapbox URL. It never appears in the returned payload or in logs (R5).
The pure helpers (`strip_mapbox_props`, `build_collection`) are unit-testable
without network access.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

MAPBOX_URL = "https://api.mapbox.com/isochrone/v1/mapbox/driving/{lon},{lat}"

# Mapbox decorates each feature with styling props; strip them so our payload is
# clean and carries nothing token-derived.
_MAPBOX_STYLE_PROPS = {
    "fill",
    "fillColor",
    "fill-opacity",
    "fillOpacity",
    "color",
    "opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "metric",
}

# Simple in-process TTL cache: key (lon, lat, minutes) -> (expires_at, payload).
# The work location + minutes are fixed for the MVP, so this is effectively a
# single-entry cache; a restart re-fetches.
_CACHE: dict[tuple[float, float, int], tuple[float, dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 24 * 60 * 60


def clear_cache() -> None:
    _CACHE.clear()


def strip_mapbox_props(raw: dict[str, Any], minutes: int) -> list[dict[str, Any]]:
    """Return cleaned features: styling props removed, contour_minutes set."""
    features: list[dict[str, Any]] = []
    for feat in raw.get("features", []) or []:
        props = {
            k: v for k, v in (feat.get("properties") or {}).items() if k not in _MAPBOX_STYLE_PROPS
        }
        props["contour_minutes"] = minutes
        features.append({"type": "Feature", "properties": props, "geometry": feat.get("geometry")})
    return features


def build_collection(
    features: list[dict[str, Any]], lat: float, lon: float, minutes: int
) -> dict[str, Any]:
    """Wrap cleaned features into our isochrone FeatureCollection response."""
    return {
        "type": "FeatureCollection",
        "properties": {"contour_minutes": minutes, "work": {"lat": lat, "lon": lon}},
        "features": features,
    }


def fetch_isochrone(token: str, lat: float, lon: float, minutes: int) -> dict[str, Any]:
    """Call Mapbox and return our cleaned, wrapped collection. Cached by TTL.

    Raises httpx.HTTPError on upstream failure (the caller decides whether to
    serve a stale cache entry or surface a 503).
    """
    key = (round(lon, 6), round(lat, 6), minutes)
    hit = _CACHE.get(key)
    now = time.time()
    if hit and hit[0] > now:
        return hit[1]

    url = MAPBOX_URL.format(lon=lon, lat=lat)
    params = {"contours_minutes": minutes, "polygons": "true", "access_token": token}
    # Log without the token or the full URL (which carries it as a query param).
    logger.info("Fetching isochrone: %s min driving from work location", minutes)
    resp = httpx.get(url, params=params, timeout=10.0)
    resp.raise_for_status()

    cleaned = strip_mapbox_props(resp.json(), minutes)
    payload = build_collection(cleaned, lat=lat, lon=lon, minutes=minutes)
    _CACHE[key] = (now + CACHE_TTL_SECONDS, payload)
    return payload


def cached_isochrone(lat: float, lon: float, minutes: int) -> dict[str, Any] | None:
    """Return a cached (possibly stale) payload if one exists, else None."""
    key = (round(lon, 6), round(lat, 6), minutes)
    hit = _CACHE.get(key)
    return hit[1] if hit else None
