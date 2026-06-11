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
    # Census ACS context (spec 008). Optional — omitted when unavailable.
    population: int | None = None
    median_income: int | None = None
    price_to_income: float | None = None


class HousingResponse(BaseModel):
    metro: str
    currency: str = "USD"
    as_of: str
    zips: list[ZipValue]


class GeocodeResult(BaseModel):
    lat: float
    lon: float
    place_name: str


class CommuteEstimate(BaseModel):
    """Routed drive times for a (home, work) pair (spec 011 R2). Departure
    labels are origin-local naive timestamps, e.g. '2026-06-15T08:00'."""

    am_minutes: int
    am_depart_local: str
    pm_minutes: int
    pm_depart_local: str


class RegionInfo(BaseModel):
    """A selectable state: name + map bounds/center for the picker (national)."""

    code: str
    name: str
    bbox: list[float] | None = None  # [minLon, minLat, maxLon, maxLat]
    center: list[float] | None = None  # [lon, lat]
    zip_count: int
