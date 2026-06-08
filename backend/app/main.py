"""FastAPI application entry point.

Run from backend/:  uvicorn app.main:app --reload
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import housing, isochrone

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="tradespace", version="0.1.0")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(housing.router)
app.include_router(isochrone.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
