"""FastAPI application entry point.

Run from backend/:  uvicorn app.main:app --reload
"""

import logging
import time

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .config import get_settings
from .data_loader import DataLoadError, get_data_store, load_regions
from .logging_setup import setup_logging
from .ratelimit import client_ip, limiter
from .routers import geocode, housing, isochrone

settings = get_settings()
setup_logging(settings.log_format)
access_logger = logging.getLogger("tradespace.access")

app = FastAPI(title="tradespace", version="0.1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)

HEALTH_PATH = "/api/health"


@app.middleware("http")
async def log_requests(request: Request, call_next) -> Response:
    """Access log with timing + client IP (004 R5). Health probes are skipped
    to keep platform-probe noise out of the logs."""
    start = time.perf_counter()
    response = await call_next(request)
    if request.url.path != HEALTH_PATH:
        access_logger.info(
            "%s %s -> %d",
            request.method,
            request.url.path,
            response.status_code,
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                "client_ip": client_ip(request),
            },
        )
    return response


app.include_router(housing.router)
app.include_router(isochrone.router)
app.include_router(geocode.router)


@app.get(HEALTH_PATH)
def health() -> JSONResponse:
    """Platform health probe (004 R6): verifies the region index parses and at
    least one state store loads. Fast after first call — stores are cached."""
    try:
        regions = load_regions()
        if regions:
            get_data_store(regions[0]["code"])
    except (DataLoadError, OSError, ValueError, KeyError):
        regions = []
    if not regions:
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return JSONResponse(content={"status": "ok", "version": app.version, "states": len(regions)})
