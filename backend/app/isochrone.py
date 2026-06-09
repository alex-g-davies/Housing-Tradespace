"""Mapbox Isochrone client and response shaping (commute layer, spec 003).

The token is passed in from settings (config.py) and is used ONLY to build the
outbound Mapbox URL. It never appears in the returned payload or in logs (R5).
The pure helpers (strip_mapbox_props, build_collection, next_departure,
geodesic_area_sqmi, summarize_variation) are unit-testable without network.
"""

from __future__ import annotations

import datetime
import logging
import math
import time
from typing import Any
from zoneinfo import ZoneInfo

import httpx

logger = logging.getLogger(__name__)

ISO_URL = "https://api.mapbox.com/isochrone/v1/mapbox/{profile}/{lon},{lat}"

# Representative weekday departure windows in the metro's local time, ordered
# from largest reach (off-peak) to smallest (peak) so features render with the
# peak band on top. (scenario, local hour, human label.)
METRO_TZ = ZoneInfo("America/Los_Angeles")
SCENARIOS: tuple[tuple[str, int, str], ...] = (
    ("offpeak", 21, "Light traffic"),
    ("typical", 12, "Midday"),
    ("peak", 8, "Rush hour"),
)

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

# In-process TTL cache: (lon, lat, minutes) -> (expires_at, variation payload).
_CACHE: dict[tuple[float, float, int], tuple[float, dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 24 * 60 * 60

_EARTH_R_M = 6_371_000.0
_SQM_PER_SQMI = 2_589_988.110336


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
    features: list[dict[str, Any]],
    lat: float,
    lon: float,
    minutes: int,
    variation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Wrap cleaned features into our isochrone FeatureCollection response."""
    return {
        "type": "FeatureCollection",
        "properties": {
            "contour_minutes": minutes,
            "work": {"lat": lat, "lon": lon},
            "variation": variation,
        },
        "features": features,
    }


def next_departure(hour: int, now: datetime.datetime) -> str:
    """Next future weekday (Mon-Fri) at `hour`:00 local time as ISO
    'YYYY-MM-DDThh:mm' (Mapbox depart_at requires a future time)."""
    cand = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if cand <= now:
        cand += datetime.timedelta(days=1)
    while cand.weekday() >= 5:  # Saturday/Sunday -> roll to Monday
        cand += datetime.timedelta(days=1)
    return cand.strftime("%Y-%m-%dT%H:%M")


def _ring_area_m2(ring: list[list[float]]) -> float:
    """Spherical area of a single [ [lon,lat], ... ] ring, in square meters."""
    if len(ring) < 4:
        return 0.0
    total = 0.0
    for i in range(len(ring) - 1):
        lon1, lat1 = ring[i][0], ring[i][1]
        lon2, lat2 = ring[i + 1][0], ring[i + 1][1]
        total += math.radians(lon2 - lon1) * (
            2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2))
        )
    return abs(total * _EARTH_R_M * _EARTH_R_M / 2.0)


def geodesic_area_sqmi(geometry: dict[str, Any] | None) -> float:
    """Approximate area of a (Multi)Polygon geometry in square miles."""
    if not geometry:
        return 0.0
    gtype = geometry.get("type")
    coords = geometry.get("coordinates") or []
    polys = coords if gtype == "MultiPolygon" else [coords] if gtype == "Polygon" else []
    area_m2 = 0.0
    for poly in polys:
        if not poly:
            continue
        area_m2 += _ring_area_m2(poly[0])  # exterior ring
        for hole in poly[1:]:
            area_m2 -= _ring_area_m2(hole)
    return round(area_m2 / _SQM_PER_SQMI, 1)


def summarize_variation(areas: dict[str, float]) -> dict[str, Any]:
    """Build the numeric reach-variation summary from per-scenario areas."""
    off, typ, peak = areas.get("offpeak"), areas.get("typical"), areas.get("peak")
    shrink = round((off - peak) / off * 100, 1) if off and peak and off > 0 else None
    return {
        "offpeak_sqmi": off,
        "typical_sqmi": typ,
        "peak_sqmi": peak,
        "peak_shrink_pct": shrink,
    }


def _fetch_contour(
    token: str, lat: float, lon: float, minutes: int, profile: str, depart_at: str | None
) -> dict[str, Any]:
    url = ISO_URL.format(profile=profile, lon=lon, lat=lat)
    params: dict[str, Any] = {
        "contours_minutes": minutes,
        "polygons": "true",
        "access_token": token,
    }
    if depart_at:
        params["depart_at"] = depart_at
    resp = httpx.get(url, params=params, timeout=15.0)
    resp.raise_for_status()
    return resp.json()


def fetch_variation(
    token: str, lat: float, lon: float, minutes: int, now: datetime.datetime | None = None
) -> dict[str, Any]:
    """Build a time-of-day variation collection: the `minutes`-contour under each
    departure scenario (driving-traffic), with per-band area + a numeric summary.
    Cached by TTL. Scenarios that fail are skipped; raises only if ALL fail."""
    key = (round(lon, 6), round(lat, 6), minutes)
    hit = _CACHE.get(key)
    clock = time.time()
    if hit and hit[0] > clock:
        return hit[1]

    now = now or datetime.datetime.now(METRO_TZ)
    logger.info("Fetching commute variation: %s min from work location", minutes)
    features: list[dict[str, Any]] = []
    areas: dict[str, float] = {}
    for scenario, hour, label in SCENARIOS:
        try:
            raw = _fetch_contour(
                token, lat, lon, minutes, "driving-traffic", next_departure(hour, now)
            )
        except httpx.HTTPError:
            logger.warning("Isochrone scenario %s failed", scenario)
            continue
        cleaned = strip_mapbox_props(raw, minutes)
        if not cleaned:
            continue
        feat = cleaned[0]
        area = geodesic_area_sqmi(feat.get("geometry"))
        feat["properties"].update({"scenario": scenario, "label": label, "area_sqmi": area})
        features.append(feat)
        areas[scenario] = area

    if not features:
        raise httpx.HTTPError("all isochrone scenarios failed")

    payload = build_collection(
        features, lat=lat, lon=lon, minutes=minutes, variation=summarize_variation(areas)
    )
    _CACHE[key] = (clock + CACHE_TTL_SECONDS, payload)
    return payload


def cached_variation(lat: float, lon: float, minutes: int) -> dict[str, Any] | None:
    """Return a cached (possibly stale) payload if one exists, else None."""
    hit = _CACHE.get((round(lon, 6), round(lat, 6), minutes))
    return hit[1] if hit else None
