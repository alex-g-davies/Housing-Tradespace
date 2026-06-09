"""Pure metric helpers in scripts/build_data.py (002). Loaded by file path since
scripts/ is not an importable package."""

import gzip
import importlib.util
from pathlib import Path

import pandas as pd
from shapely.geometry import MultiPolygon, Point, box

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


def test_clip_to_land_removes_water_half():
    zip_poly = box(0, 0, 1, 1)  # 1.0 deg^2
    water = box(0.5, 0, 1.5, 1)  # covers the right half
    out = build_data.clip_to_land(zip_poly, water, sliver_min=1e-6, tolerance=0)
    assert out is not None
    assert abs(out.area - 0.5) < 1e-9  # only the land (left) half remains
    assert out.contains(Point(0.25, 0.5))
    assert not out.contains(Point(0.75, 0.5))  # water side removed


def test_clip_to_land_drops_sub_threshold_slivers():
    land = box(0, 0, 1, 1)  # area 1.0
    sliver = box(2, 2, 2.001, 2.001)  # area 1e-6, below threshold
    out = build_data.clip_to_land(MultiPolygon([land, sliver]), None, sliver_min=1e-4, tolerance=0)
    assert out.geom_type == "Polygon"  # sliver dropped -> single polygon
    assert abs(out.area - 1.0) < 1e-9


def test_clip_to_land_keeps_island_fully_inside_water():
    # A ZIP fully covered by the coarse water mask is an island the mask can't
    # cut out (e.g. Mercer Island) -> keep the original rather than delete it.
    island = box(0, 0, 1, 1)
    out = build_data.clip_to_land(island, box(-1, -1, 2, 2), tolerance=0)
    assert out is not None
    assert abs(out.area - 1.0) < 1e-9
