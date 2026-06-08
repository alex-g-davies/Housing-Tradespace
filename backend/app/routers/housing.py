"""Housing endpoints: per-ZIP median values (R1) and the merged choropleth
GeoJSON (R2). Values and geometry are split so the small values payload is
testable/cacheable independently of the larger geometry."""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ..data_loader import DataStore, get_data_store
from ..models import HousingResponse, ZipValue

router = APIRouter(prefix="/api", tags=["housing"])


@router.get("/housing", response_model=HousingResponse)
def get_housing(store: DataStore = Depends(get_data_store)) -> HousingResponse:
    """Per-ZIP median home values for the metro (R1). Invalid ZIPs are absent."""
    zips = [ZipValue(zip=z, median_value=v) for z, v in sorted(store.housing.values.items())]
    return HousingResponse(metro=store.housing.metro, as_of=store.housing.as_of, zips=zips)


@router.get("/zips.geojson")
def get_zips_geojson(store: DataStore = Depends(get_data_store)) -> JSONResponse:
    """ZIP boundary FeatureCollection with `zip` + `median_value` merged in (R2)."""
    return JSONResponse(content=store.geojson)
