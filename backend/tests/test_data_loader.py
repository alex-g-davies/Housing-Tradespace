"""R1/002: data loading skips invalid/missing ZIPs and never raises; enriched
metrics are coerced individually (invalid -> None) and the join key is a
5-character zero-padded string."""

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


def test_parse_housing_skips_bad_rows_and_coerces_metrics():
    raw = json.load(open(FIXTURES / "sample_zhvi.json", encoding="utf-8"))
    parsed = parse_housing(raw)
    # 4 valid (98101 str, 98109 int, 98103, 98112); 3 skipped (bad zip, null, negative)
    assert set(parsed.records) == {"98101", "98109", "98103", "98112"}
    assert parsed.records["98109"].median_value == 890000
    assert parsed.skipped == 3
    assert parsed.metro == "Seattle, WA"

    full = parsed.records["98101"]
    assert full.yoy_pct == 4.2
    assert full.cagr5_pct == 8.1
    assert full.ppsf == 612
    assert full.history == [("2023-Q4", 700000), ("2024-Q2", 712000), ("2024-Q4", 720000)]

    # Negative YoY is valid and kept; an unparseable metric coerces to None.
    assert parsed.records["98103"].yoy_pct == -1.5
    assert parsed.records["98112"].yoy_pct is None
    # A ZIP with no metric at all leaves it None.
    assert parsed.records["98109"].yoy_pct is None
    assert parsed.records["98109"].ppsf == 540

    # Place name (012): present when enriched, None otherwise.
    assert full.name == "Seattle"
    assert parsed.records["98109"].name is None

    # ACS fields (008): coerced individually; garbage/sentinels -> None.
    assert full.population == 45000
    assert full.median_income == 110000
    assert full.price_to_income == 6.5
    assert parsed.records["98103"].population is None  # "oops"
    assert parsed.records["98103"].median_income is None  # negative sentinel
    assert parsed.records["98109"].population is None  # absent


def test_merge_geojson_merges_scalar_metrics_and_excludes_history():
    raw = json.load(open(FIXTURES / "sample_zhvi.json", encoding="utf-8"))
    records = parse_housing(raw).records
    geo = json.load(open(FIXTURES / "sample_zcta.geojson", encoding="utf-8"))
    merged = merge_geojson(geo, records)

    zips = [f["properties"]["zip"] for f in merged["features"]]
    assert "ZZZ" not in zips  # invalid ZIP feature dropped
    assert "98115" in zips  # ZCTA5CE20-keyed feature normalized to `zip`

    by_zip = {f["properties"]["zip"]: f["properties"] for f in merged["features"]}
    assert by_zip["98101"]["median_value"] == 720000
    assert by_zip["98101"]["yoy_pct"] == 4.2
    assert by_zip["98101"]["ppsf"] == 612
    assert by_zip["98101"]["price_to_income"] == 6.5  # 014 R1
    assert "price_to_income" not in by_zip["98109"]  # no income -> omitted
    # History never goes into the GeoJSON (MapLibre stringifies nested props).
    assert "history" not in by_zip["98101"]
    # 98109 has no YoY -> property omitted (renders as 'no data' for that metric).
    assert "yoy_pct" not in by_zip["98109"]
    assert by_zip["98109"]["ppsf"] == 540
    # 98115 has no ZHVI record -> all metrics omitted.
    assert "median_value" not in by_zip["98115"]


def test_parse_housing_handles_empty_input():
    assert parse_housing({}).records == {}  # no raise on missing keys
