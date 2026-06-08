"""R1: data loading skips invalid/missing ZIPs and never raises; join key is a
5-character zero-padded string. These exercise the pure parsing functions."""

import json

from app.data_loader import merge_geojson, normalize_zip, parse_housing
from tests.conftest import FIXTURES


def test_normalize_zip_zero_pads_and_validates():
    assert normalize_zip(98101) == "98101"
    assert normalize_zip("98101") == "98101"
    assert normalize_zip(2139) == "02139"  # leading-zero preserved
    assert normalize_zip("ABCDE") is None
    assert normalize_zip(None) is None
    assert normalize_zip(-5) is None
    assert normalize_zip("123456") is None  # too long


def test_parse_housing_skips_bad_rows_without_raising():
    raw = json.load(open(FIXTURES / "sample_zhvi.json", encoding="utf-8"))
    parsed = parse_housing(raw)
    # 4 valid (98101 str, 98109 int, 98103, 98112); 3 skipped (bad zip, null, negative)
    assert set(parsed.values) == {"98101", "98109", "98103", "98112"}
    assert parsed.values["98109"] == 890000
    assert parsed.skipped == 3
    assert parsed.metro == "Seattle, WA"
    assert parsed.as_of == "2024-12-31"


def test_merge_geojson_drops_bad_zip_and_omits_missing_value():
    raw = json.load(open(FIXTURES / "sample_zhvi.json", encoding="utf-8"))
    values = parse_housing(raw).values
    geo = json.load(open(FIXTURES / "sample_zcta.geojson", encoding="utf-8"))
    merged = merge_geojson(geo, values)

    zips = [f["properties"]["zip"] for f in merged["features"]]
    assert "ZZZ" not in zips  # invalid ZIP feature dropped
    assert "98115" in zips  # ZCTA5CE20-keyed feature normalized to `zip`

    by_zip = {f["properties"]["zip"]: f["properties"] for f in merged["features"]}
    assert by_zip["98101"]["median_value"] == 720000
    # 98115 has no ZHVI value -> property omitted entirely (renders as 'no data')
    assert "median_value" not in by_zip["98115"]


def test_parse_housing_handles_empty_input():
    assert parse_housing({}).values == {}  # no raise on missing keys
