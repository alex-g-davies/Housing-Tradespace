"""Pydantic response models. Note: no model carries the Mapbox token (R5)."""

from pydantic import BaseModel


class ZipValue(BaseModel):
    zip: str
    median_value: int
    # Enriched metrics (spec 002). Optional — omitted when unavailable.
    yoy_pct: float | None = None
    cagr5_pct: float | None = None
    ppsf: float | None = None
    history: list[tuple[str, int]] | None = None


class HousingResponse(BaseModel):
    metro: str
    currency: str = "USD"
    as_of: str
    zips: list[ZipValue]


class GeocodeResult(BaseModel):
    lat: float
    lon: float
    place_name: str
