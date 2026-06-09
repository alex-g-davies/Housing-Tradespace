"""Pydantic response models. Note: no model carries the Mapbox token (R5)."""

from pydantic import BaseModel


class ZipValue(BaseModel):
    zip: str
    median_value: int


class HousingResponse(BaseModel):
    metro: str
    currency: str = "USD"
    as_of: str
    zips: list[ZipValue]


class GeocodeResult(BaseModel):
    lat: float
    lon: float
    place_name: str
