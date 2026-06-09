"""Address search endpoint (forward geocoding). The Mapbox token stays
server-side (R5); the client sends only a free-text query."""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from ..config import Settings, get_settings
from ..geocode import forward_geocode
from ..models import GeocodeResult

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["geocode"])

# Bias results toward the Seattle metro.
SEATTLE_LON, SEATTLE_LAT = -122.3321, 47.6062


@router.get("/geocode", response_model=GeocodeResult)
def geocode(
    q: str = Query(..., min_length=1, description="Address or place to find"),
    settings: Settings = Depends(get_settings),
) -> GeocodeResult:
    if not settings.mapbox_token.strip():
        raise HTTPException(status_code=503, detail="geocoding unavailable (no token configured)")
    try:
        result = forward_geocode(settings.mapbox_token, q, SEATTLE_LON, SEATTLE_LAT)
    except httpx.HTTPError:
        logger.warning("Geocoding upstream call failed")
        raise HTTPException(status_code=503, detail="geocoding upstream unavailable") from None

    if result is None:
        raise HTTPException(status_code=404, detail=f"no match for {q!r}")
    return GeocodeResult(**result)
