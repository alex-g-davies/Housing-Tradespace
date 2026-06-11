"""Per-IP rate limiting (spec 004 R1).

One in-process limiter shared by all routers. The deployment target is a single
container behind the platform's reverse proxy (spec 006), so in-memory storage
is sufficient and the client IP comes from `X-Forwarded-For` when present.

Ceilings are env-tunable (read once at import):
  RATE_LIMIT_UPSTREAM  token-spending endpoints (isochrone, geocode)
  RATE_LIMIT_DATA      data endpoints (housing, zips.geojson, regions)
"""

from __future__ import annotations

import os

from slowapi import Limiter
from starlette.requests import Request

UPSTREAM_LIMIT = os.getenv("RATE_LIMIT_UPSTREAM", "10/minute")
DATA_LIMIT = os.getenv("RATE_LIMIT_DATA", "60/minute")


def client_ip(request: Request) -> str:
    """First X-Forwarded-For hop (set by the platform proxy), else socket peer."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=client_ip)
