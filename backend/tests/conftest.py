"""Shared pytest fixtures: a TestClient with settings + data store overridden to
point at small test fixtures, and a clean isochrone cache per test."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import geocode as geo_module
from app import isochrone as iso_module
from app.config import Settings, get_settings
from app.data_loader import DataStore, get_data_store, merge_geojson, parse_housing
from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


def _make_settings(**overrides) -> Settings:
    base = dict(
        mapbox_token="test-token-do-not-leak",
        work_lat=47.6062,
        work_lon=-122.3321,
        contour_minutes=30,
        use_fixture=False,
        _env_file=None,  # don't read a real .env during tests
    )
    base.update(overrides)
    return Settings(**base)


@pytest.fixture(autouse=True)
def _clear_caches():
    iso_module.clear_cache()
    geo_module.clear_cache()
    yield
    iso_module.clear_cache()
    geo_module.clear_cache()


@pytest.fixture
def fixture_store() -> DataStore:
    with open(FIXTURES / "sample_zhvi.json", encoding="utf-8") as f:
        housing = parse_housing(json.load(f))
    with open(FIXTURES / "sample_zcta.geojson", encoding="utf-8") as f:
        geojson = merge_geojson(json.load(f), housing.records)
    return DataStore(housing=housing, geojson=geojson)


@pytest.fixture
def client(fixture_store):
    """TestClient wired to fixture data and a fake token (Mapbox not called by
    default — individual tests opt into live or fixture isochrone mode)."""
    app.dependency_overrides[get_data_store] = lambda: fixture_store
    app.dependency_overrides[get_settings] = lambda: _make_settings()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def make_client(fixture_store):
    """Factory to build a client with custom settings overrides."""

    def _factory(**overrides):
        app.dependency_overrides[get_data_store] = lambda: fixture_store
        app.dependency_overrides[get_settings] = lambda: _make_settings(**overrides)
        return TestClient(app)

    yield _factory
    app.dependency_overrides.clear()


@pytest.fixture
def mapbox_response() -> dict:
    with open(FIXTURES / "mapbox_iso_response.json", encoding="utf-8") as f:
        return json.load(f)
