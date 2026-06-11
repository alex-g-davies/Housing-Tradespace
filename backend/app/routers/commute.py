"""Per-ZIP commute estimate endpoint (spec 011 R2/R5/R6). The token-bearing
Directions calls stay server-side; the client sends only two coordinate pairs."""

import logging
import math

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..commute import fetch_commute
from ..config import Settings, get_settings
from ..data_loader import within_coverage
from ..models import CommuteEstimate
from ..ratelimit import UPSTREAM_LIMIT, limiter
from ..usage import UsageBudgetError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["commute"])

# Beyond this straight-line distance the pair isn't a commute; refuse rather
# than spend two Directions calls on it (011 R5).
MAX_COMMUTE_MILES = 250.0
_EARTH_R_MI = 3958.8


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * _EARTH_R_MI * math.asin(math.sqrt(a))


@router.get("/commute", response_model=CommuteEstimate)
@limiter.limit(UPSTREAM_LIMIT)
def get_commute(
    request: Request,
    from_lat: float = Query(..., ge=-90, le=90, description="Home latitude"),
    from_lon: float = Query(..., ge=-180, le=180, description="Home longitude"),
    to_lat: float = Query(..., ge=-90, le=90, description="Work latitude"),
    to_lon: float = Query(..., ge=-180, le=180, description="Work longitude"),
    settings: Settings = Depends(get_settings),
) -> CommuteEstimate:
    if not settings.mapbox_token.strip():
        raise HTTPException(
            status_code=503, detail="commute estimate unavailable (no token configured)"
        )
    if not (within_coverage(from_lat, from_lon) and within_coverage(to_lat, to_lon)):
        raise HTTPException(status_code=422, detail="location outside the covered regions")
    if _haversine_miles(from_lat, from_lon, to_lat, to_lon) > MAX_COMMUTE_MILES:
        raise HTTPException(status_code=422, detail="too far apart for a commute estimate")

    try:
        result = fetch_commute(
            settings.mapbox_token,
            from_lat,
            from_lon,
            to_lat,
            to_lon,
            daily_budget=settings.mapbox_daily_call_budget,
        )
    except UsageBudgetError:
        logger.warning("Commute estimate skipped: daily upstream budget exhausted")
        raise HTTPException(
            status_code=503, detail="commute estimate temporarily unavailable"
        ) from None
    except httpx.HTTPError:
        # Never leak the token (which lives in the request URL) into the error.
        logger.warning("Commute upstream call failed", exc_info=False)
        raise HTTPException(status_code=503, detail="commute upstream unavailable") from None

    if result is None:
        raise HTTPException(status_code=404, detail="no drivable route between these points")
    return CommuteEstimate(**result)
