"""Housing endpoints: the region index, per-ZIP enriched values (R1), and the
merged choropleth GeoJSON (R2), all scoped to a selectable state."""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from ..data_loader import DataStore, get_data_store, load_regions, region_codes
from ..models import HousingResponse, RegionInfo, ZipValue

router = APIRouter(prefix="/api", tags=["housing"])

DEFAULT_STATE = "WA"


def _store_for(state: str) -> DataStore:
    code = (state or DEFAULT_STATE).upper()
    if code not in region_codes():
        raise HTTPException(status_code=404, detail=f"unknown state {code!r}")
    return get_data_store(code)


@router.get("/regions", response_model=list[RegionInfo])
def get_regions() -> list[RegionInfo]:
    """States available to select, with bounds/center for the picker + map fit."""
    return [RegionInfo(**r) for r in load_regions()]


@router.get("/housing", response_model=HousingResponse)
def get_housing(state: str = Query(DEFAULT_STATE)) -> HousingResponse:
    """Per-ZIP enriched metrics for a state (R1/002). Invalid ZIPs are absent."""
    store = _store_for(state)
    zips = [
        ZipValue(
            zip=r.zip,
            median_value=r.median_value,
            yoy_pct=r.yoy_pct,
            cagr5_pct=r.cagr5_pct,
            ppsf=r.ppsf,
            history=r.history,
        )
        for _, r in sorted(store.housing.records.items())
    ]
    return HousingResponse(metro=store.housing.metro, as_of=store.housing.as_of, zips=zips)


@router.get("/zips.geojson")
def get_zips_geojson(state: str = Query(DEFAULT_STATE)) -> JSONResponse:
    """ZIP boundary FeatureCollection with scalar metrics merged in (R2)."""
    return JSONResponse(content=_store_for(state).geojson)
