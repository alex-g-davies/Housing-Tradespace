"""Commute isochrone endpoint (R3) and the Mapbox token-safety boundary (R5).

The work location and contour minutes are hard-coded server-side, so the client
sends no params and the token-bearing Mapbox call never leaves the backend.
"""

import json
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from ..config import DATA_DIR, Settings, get_settings
from ..isochrone import (
    build_collection,
    cached_isochrone,
    fetch_isochrone,
    strip_mapbox_props,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["isochrone"])

FIXTURE_FILE = "isochrone_fixture.json"


def _load_fixture(settings: Settings) -> dict:
    """Serve the committed isochrone fixture, re-wrapped for the current work
    location so the overlay renders without a Mapbox token (fixture-first)."""
    with open(DATA_DIR / FIXTURE_FILE, encoding="utf-8") as f:
        raw = json.load(f)
    features = strip_mapbox_props(raw, settings.contour_minutes)
    return build_collection(
        features, lat=settings.work_lat, lon=settings.work_lon, minutes=settings.contour_minutes
    )


@router.get("/isochrone")
def get_isochrone(settings: Settings = Depends(get_settings)) -> JSONResponse:
    if settings.serve_fixture:
        return JSONResponse(content=_load_fixture(settings))

    try:
        payload = fetch_isochrone(
            token=settings.mapbox_token,
            lat=settings.work_lat,
            lon=settings.work_lon,
            minutes=settings.contour_minutes,
        )
        return JSONResponse(content=payload)
    except httpx.HTTPError:
        # Never leak the token (which lives in the request URL) into the error.
        logger.warning("Isochrone upstream call failed", exc_info=False)
        stale = cached_isochrone(settings.work_lat, settings.work_lon, settings.contour_minutes)
        if stale is not None:
            return JSONResponse(content=stale)
        raise HTTPException(status_code=503, detail="isochrone upstream unavailable") from None
