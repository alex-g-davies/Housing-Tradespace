"""Point-to-point commute estimates via the Mapbox Directions API (011 R2).

True routed drive times for a (home, work) pair in both directions: home→work
departing 08:00 home-local, work→home departing 17:30 work-local, both next
weekday, both traffic-predicted (driving-traffic + depart_at). Like the other
Mapbox clients: the token only builds outbound URLs and never appears in
payloads or logs (R5); both endpoints are snapped to the cache grid; results
(including no-route) are cached 24 h; uncached pairs reserve 2 budget calls.
"""

from __future__ import annotations

import datetime
import logging
import time
from typing import Any

import httpx

from . import tzlookup, usage
from .isochrone import next_departure, snap_origin

logger = logging.getLogger(__name__)

DIRECTIONS_URL = (
    "https://api.mapbox.com/directions/v5/mapbox/driving-traffic/"
    "{from_lon},{from_lat};{to_lon},{to_lat}"
)

AM_DEPARTURE = (8, 0)  # home -> work
PM_DEPARTURE = (17, 30)  # work -> home

# (from_lon, from_lat, to_lon, to_lat) -> (expires_at, payload-or-None).
# None caches "no drivable route" so we don't re-ask Mapbox for 24 h.
_CACHE: dict[tuple[float, float, float, float], tuple[float, dict[str, Any] | None]] = {}
CACHE_TTL_SECONDS = 24 * 60 * 60


def clear_cache() -> None:
    _CACHE.clear()


def _route_minutes(
    token: str,
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
    depart_at: str,
) -> int | None:
    """One Directions leg -> predicted minutes, or None when no route exists."""
    url = DIRECTIONS_URL.format(from_lon=from_lon, from_lat=from_lat, to_lon=to_lon, to_lat=to_lat)
    params = {
        "access_token": token,
        "depart_at": depart_at,
        "alternatives": "false",
        "overview": "false",
    }
    resp = httpx.get(url, params=params, timeout=15.0)
    resp.raise_for_status()
    body = resp.json()
    if body.get("code") != "Ok" or not body.get("routes"):
        return None
    return round(body["routes"][0]["duration"] / 60)


def fetch_commute(
    token: str,
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
    *,
    now: datetime.datetime | None = None,
    daily_budget: int = 0,
) -> dict[str, Any] | None:
    """Both commute legs for a (home, work) pair, cached by snapped endpoints.

    Returns {am_minutes, am_depart_local, pm_minutes, pm_depart_local} or None
    when either direction has no drivable route. Raises UsageBudgetError before
    any upstream call when the daily budget is exhausted; httpx.HTTPError on
    upstream failure (nothing cached in that case)."""
    from_lat, from_lon = snap_origin(from_lat, from_lon)
    to_lat, to_lon = snap_origin(to_lat, to_lon)
    key = (from_lon, from_lat, to_lon, to_lat)
    clock = time.time()
    hit = _CACHE.get(key)
    if hit and hit[0] > clock:
        return hit[1]

    if not usage.reserve(2, daily_budget):
        raise usage.UsageBudgetError("daily upstream budget exhausted")

    # Each leg departs on its ORIGIN's clock (011 R1 semantics).
    am_now = now or datetime.datetime.now(tzlookup.tz_for(from_lat, from_lon))
    am_depart = next_departure(AM_DEPARTURE[0], am_now, minute=AM_DEPARTURE[1])
    pm_now = now or datetime.datetime.now(tzlookup.tz_for(to_lat, to_lon))
    pm_depart = next_departure(PM_DEPARTURE[0], pm_now, minute=PM_DEPARTURE[1])

    logger.info("Fetching commute estimate (2 legs)")  # no coordinates, no token
    am = _route_minutes(token, from_lat, from_lon, to_lat, to_lon, am_depart)
    pm = _route_minutes(token, to_lat, to_lon, from_lat, from_lon, pm_depart)

    payload: dict[str, Any] | None = None
    if am is not None and pm is not None:
        payload = {
            "am_minutes": am,
            "am_depart_local": am_depart,
            "pm_minutes": pm,
            "pm_depart_local": pm_depart,
        }
    _CACHE[key] = (clock + CACHE_TTL_SECONDS, payload)
    return payload
