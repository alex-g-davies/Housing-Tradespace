"""Pure metric helpers in scripts/build_data.py (002). Loaded by file path since
scripts/ is not an importable package."""

import gzip
import importlib.util
from pathlib import Path

import pandas as pd

_PATH = Path(__file__).resolve().parent.parent / "scripts" / "build_data.py"
_spec = importlib.util.spec_from_file_location("build_data", _PATH)
build_data = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build_data)


def test_pct_change():
    assert build_data.pct_change(100, 110) == 10.0
    assert build_data.pct_change(100, 90) == -10.0
    assert build_data.pct_change(0, 100) is None  # non-positive base


def test_cagr():
    assert build_data.cagr(100, 200, 5) == 14.9  # doubling over 5 years
    assert build_data.cagr(0, 100, 5) is None
    assert build_data.cagr(100, 100, 5) == 0.0


def test_quarter_label():
    assert build_data.quarter_label("2026-01-31") == "2026-Q1"
    assert build_data.quarter_label("2026-04-30") == "2026-Q2"
    assert build_data.quarter_label("2026-12-31") == "2026-Q4"


def test_downsample_quarterly_keeps_last_point_per_quarter():
    date_cols = ["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"]
    row = pd.Series({"2024-01-31": 100, "2024-02-29": 110, "2024-03-31": 120, "2024-04-30": 130})
    out = build_data.downsample_quarterly(date_cols, row, max_points=10)
    assert out == [["2024-Q1", 120], ["2024-Q2", 130]]


def test_downsample_quarterly_respects_max_points():
    date_cols = ["2023-03-31", "2023-06-30", "2023-09-30", "2023-12-31"]
    row = pd.Series(dict.fromkeys(date_cols, 100) | {"2023-12-31": 130})
    out = build_data.downsample_quarterly(date_cols, row, max_points=2)
    assert [q for q, _ in out] == ["2023-Q3", "2023-Q4"]


def test_build_redfin_picks_latest_all_residential_ppsf(tmp_path):
    rows = [
        "region\tregion_type_id\tproperty_type\tperiod_end\tmedian_ppsf",
        "Zip Code: 98103\t2\tAll Residential\t2025-01-31\t600",
        "Zip Code: 98103\t2\tAll Residential\t2026-04-30\t640",  # latest -> wins
        "Zip Code: 98103\t2\tSingle Family Residential\t2026-04-30\t700",  # wrong type
        "Zip Code: 98199\t2\tAll Residential\t2026-04-30\t",  # NaN ppsf -> skipped
        "Zip Code: 99999\t2\tAll Residential\t2026-04-30\t800",  # not in our ZIP set
        "King County, WA\t5\tAll Residential\t2026-04-30\t999",  # not a ZIP region
    ]
    path = tmp_path / "redfin.tsv.gz"
    with gzip.open(path, "wt", encoding="utf-8") as f:
        f.write("\n".join(rows) + "\n")

    out = build_data.build_redfin(str(path), {"98103", "98199"})
    assert out == {"98103": 640.0}  # latest period, All Residential, in-set, non-null


def test_state_name():
    assert build_data.state_name("WA") == "Washington"
    assert build_data.state_name("NY") == "New York"
    assert build_data.state_name("DC") == "District Of Columbia"


def test_price_to_income():
    assert build_data.price_to_income(720000, 110000) == 6.5
    assert build_data.price_to_income(720000, None) is None
    assert build_data.price_to_income(720000, 0) is None
    assert build_data.price_to_income(720000, -666666666) is None
    assert build_data.price_to_income(None, 110000) is None


def test_parse_acs_drops_sentinels_and_bad_zips():
    rows = [
        ["B01003_001E", "B19013_001E", "zip code tabulation area"],
        ["45000", "110000", "98101"],  # both fields valid
        ["12000", "-666666666", "98103"],  # income sentinel -> population only
        ["0", "-222222222", "98109"],  # nothing valid -> ZIP absent
        ["500", "60000", "not-a-zip"],  # bad ZIP -> skipped
        [None, "70000", "00501"],  # null population -> income only
    ]
    out = build_data.parse_acs(rows)
    assert out["98101"] == {"population": 45000, "median_income": 110000}
    assert out["98103"] == {"population": 12000}
    assert "98109" not in out
    assert out["00501"] == {"median_income": 70000}
    assert "not-a-zip" not in out and len(out) == 3


def test_parse_acs_column_order_independent():
    rows = [
        ["zip code tabulation area", "B19013_001E", "B01003_001E"],
        ["98101", "110000", "45000"],
    ]
    assert build_data.parse_acs(rows) == {"98101": {"population": 45000, "median_income": 110000}}


def test_apply_acs_merges_and_computes_ratio():
    records = [
        {"zip": "98101", "median_value": 720000},
        {"zip": "98115", "median_value": 650000},  # no ACS row -> untouched
        {"zip": "98103", "median_value": 937500},  # population only -> no ratio
    ]
    acs = {
        "98101": {"population": 45000, "median_income": 110000},
        "98103": {"population": 12000},
    }
    build_data.apply_acs(records, acs)
    assert records[0]["population"] == 45000
    assert records[0]["price_to_income"] == 6.5
    assert records[1] == {"zip": "98115", "median_value": 650000}
    assert records[2]["population"] == 12000
    assert "price_to_income" not in records[2]


def test_parse_zhvi_national_groups_by_state():
    csv = (
        "RegionName,State,2025-04-30,2026-04-30\n"
        "98101,WA,700000,720000\n"
        "98103,WA,900000,937500\n"
        "43001,OH,150000,160000\n"
        "00000,,,\n"  # missing state + value -> skipped
    )
    as_of, by_state = build_data.parse_zhvi_national(csv)
    assert as_of == "2026-04-30"
    assert set(by_state) == {"WA", "OH"}
    assert [r["zip"] for r in by_state["WA"]] == ["98101", "98103"]
    assert by_state["WA"][0]["median_value"] == 720000
    assert by_state["OH"][0]["median_value"] == 160000
