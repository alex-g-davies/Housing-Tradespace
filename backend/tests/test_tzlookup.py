"""Spec 011 R1: departure dates roll on the work location's local clock."""

import datetime
import json
from pathlib import Path
from zoneinfo import ZoneInfo

from app import isochrone as iso_module
from app import tzlookup
from app.isochrone import next_departure

TOKEN = "test-token-do-not-leak"


def test_tz_for_resolves_fixture_regions():
    # conftest's fixture regions: WA (Seattle-ish bbox) and OH.
    assert tzlookup.tz_for(47.65, -122.32) == ZoneInfo("America/Los_Angeles")
    assert tzlookup.tz_for(40.05, -82.65) == ZoneInfo("America/New_York")


def test_tz_for_off_coverage_falls_back_to_longitude_offset():
    tz = tzlookup.tz_for(0.0, -45.0)  # mid-Atlantic, no region
    assert tz == datetime.timezone(datetime.timedelta(hours=-3))


def test_state_tz_covers_every_committed_region():
    # Read the real committed index by path — the autouse fixture monkeypatches
    # data_loader.REGIONS_FILE to a temp copy, so go straight to the file.
    real = Path(__file__).resolve().parent.parent / "data" / "regions.json"
    codes = {r["code"] for r in json.loads(real.read_text(encoding="utf-8"))}
    assert codes <= set(tzlookup.STATE_TZ), codes - set(tzlookup.STATE_TZ)


def test_next_departure_rolls_on_an_eastern_clock():
    # 6 PM Eastern on a Wednesday: 17:00 has passed locally -> Thursday.
    wed_6pm_et = datetime.datetime(2026, 6, 10, 18, 0, tzinfo=ZoneInfo("America/New_York"))
    assert next_departure(17, wed_6pm_et) == "2026-06-11T17:00"
    # Same instant viewed from a (wrong) Pacific clock would have produced
    # today-17:00 — a past departure in Eastern time. That was the bug.
    wed_3pm_pt = wed_6pm_et.astimezone(ZoneInfo("America/Los_Angeles"))
    assert next_departure(17, wed_3pm_pt) == "2026-06-10T17:00"


def test_next_departure_supports_minutes():
    wed = datetime.datetime(2026, 6, 10, 6, 0, tzinfo=ZoneInfo("America/Chicago"))
    assert next_departure(17, wed, minute=30) == "2026-06-10T17:30"


def test_fetch_variation_resolves_tz_from_snapped_work_location(
    make_client, httpx_mock, monkeypatch
):
    seen: list[tuple[float, float]] = []

    def recorder(lat: float, lon: float) -> datetime.tzinfo:
        seen.append((lat, lon))
        return ZoneInfo("America/Los_Angeles")

    monkeypatch.setattr(tzlookup, "tz_for", recorder)
    httpx_mock.add_response(
        json={
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
                    },
                }
            ],
        },
        is_reusable=True,
    )
    client = make_client(mapbox_token=TOKEN)
    assert client.get("/api/isochrone", params={"minutes": 30}).status_code == 200
    lat, lon = iso_module.snap_origin(47.6062, -122.3321)  # conftest default work
    assert seen == [(lat, lon)]
