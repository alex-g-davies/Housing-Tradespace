"""Forward-geocoding via the Mapbox Geocoding API.

Like the isochrone client, the token is used only to build the outbound URL and
never appears in the returned payload or logs (R5). Results are cached by query.
"""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json"

# Cache: normalized query -> (expires_at, result-or-None). None caches a miss.
_CACHE: dict[str, tuple[float, dict[str, Any] | None]] = {}
CACHE_TTL_SECONDS = 24 * 60 * 60


def clear_cache() -> None:
    _CACHE.clear()


def forward_geocode(
    token: str, query: str, proximity_lon: float, proximity_lat: float
) -> dict[str, Any] | None:
    """Resolve an address/place to {lat, lon, place_name}, biased toward the
    proximity point. Returns None when there is no match. Raises httpx.HTTPError
    on upstream failure."""
    key = query.strip().lower()
    now = time.time()
    hit = _CACHE.get(key)
    if hit and hit[0] > now:
        return hit[1]

    url = GEOCODE_URL.format(query=quote(query.strip()))
    params = {
        "access_token": token,
        "limit": 1,
        "proximity": f"{proximity_lon},{proximity_lat}",
        "country": "us",
    }
    logger.info("Geocoding an address query")  # no token, no raw query
    resp = httpx.get(url, params=params, timeout=10.0)
    resp.raise_for_status()

    features = resp.json().get("features", [])
    result: dict[str, Any] | None = None
    if features:
        lon, lat = features[0]["center"]  # Mapbox returns [lon, lat]
        result = {"lat": lat, "lon": lon, "place_name": features[0].get("place_name", query)}

    _CACHE[key] = (now + CACHE_TTL_SECONDS, result)
    return result
