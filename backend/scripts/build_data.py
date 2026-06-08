"""Preprocess raw public datasets into the small committed files the app serves.

Run once by a human; the OUTPUTS (data/seattle_zhvi.json, data/seattle_zcta.geojson)
are committed, the raw inputs are not. Sources are free/aggregate (R-constraint):

  - Zillow ZHVI by ZIP (median home value):
    https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv
  - WA ZIP-code (ZCTA) boundaries GeoJSON (OpenDataDE mirror of Census TIGER):
    https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/wa_washington_zip_codes_geo.min.json

Usage (from backend/):
    python scripts/build_data.py                 # download both, filter Seattle
    python scripts/build_data.py --zhvi-path raw/zhvi.csv --geo-path raw/wa.json
    python scripts/build_data.py --metro Seattle --tolerance 0.0005

Attribution: Zillow Research (ZHVI) and U.S. Census Bureau (ZCTA) — note in README.
"""

from __future__ import annotations

import argparse
import json
import sys
from io import StringIO
from pathlib import Path

import httpx
import pandas as pd
from shapely.geometry import mapping, shape

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"

ZHVI_URL = (
    "https://files.zillowstatic.com/research/public_csvs/zhvi/"
    "Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
)
GEO_URL = (
    "https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/"
    "master/wa_washington_zip_codes_geo.min.json"
)

# Census/OpenDataDE may key the ZIP under any of these property names.
ZIP_PROP_CANDIDATES = ("ZCTA5CE20", "ZCTA5CE10", "ZCTA5CE", "zip", "ZIP", "GEOID20")


def _fetch_text(url: str) -> str:
    with httpx.Client(timeout=120, follow_redirects=True) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.text


def normalize_zip(raw) -> str | None:
    try:
        s = str(int(float(raw)))
    except (TypeError, ValueError):
        s = str(raw).strip()
    if not s.isdigit() or len(s) > 5:
        return None
    return s.zfill(5)


def build_zhvi(zhvi_csv: str, metro_substr: str) -> tuple[dict, dict[str, int]]:
    """Filter ZHVI to the metro and return (json_payload, zip->value map)."""
    df = pd.read_csv(StringIO(zhvi_csv))
    date_cols = [c for c in df.columns if c[:4].isdigit() and "-" in c]
    if not date_cols:
        raise SystemExit("No date columns found in ZHVI CSV — format changed?")
    latest = date_cols[-1]

    sub = df[df["Metro"].fillna("").str.contains(metro_substr, case=False)]
    values: dict[str, int] = {}
    skipped = 0
    for _, row in sub.iterrows():
        z = normalize_zip(row["RegionName"])
        v = row[latest]
        if z is None or pd.isna(v) or v <= 0:
            skipped += 1
            continue
        values[z] = int(round(float(v)))

    metro_name = sub["Metro"].dropna().iloc[0] if not sub.empty else metro_substr
    payload = {
        "metro": str(metro_name),
        "as_of": latest,
        "zips": [{"zip": z, "median_value": v} for z, v in sorted(values.items())],
    }
    print(f"ZHVI: {len(values)} ZIPs kept, {skipped} skipped (as_of {latest})")
    return payload, values


def build_geojson(geo_text: str, values: dict[str, int], tolerance: float) -> dict:
    """Keep features for ZIPs we have, simplify geometry, merge median_value."""
    raw = json.loads(geo_text)
    features_out = []
    for feat in raw.get("features", []):
        props = feat.get("properties") or {}
        z = None
        for key in ZIP_PROP_CANDIDATES:
            if key in props:
                z = normalize_zip(props[key])
                if z:
                    break
        if z is None or z not in values:
            continue
        geom = shape(feat["geometry"]).simplify(tolerance, preserve_topology=True)
        out_props = {"zip": z, "median_value": values[z]}
        features_out.append(
            {"type": "Feature", "properties": out_props, "geometry": mapping(geom)}
        )
    print(f"GeoJSON: {len(features_out)} ZIP polygons kept (tolerance {tolerance})")
    return {"type": "FeatureCollection", "features": features_out}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--zhvi-url", default=ZHVI_URL)
    ap.add_argument("--geo-url", default=GEO_URL)
    ap.add_argument("--zhvi-path", help="Local ZHVI CSV (skips download)")
    ap.add_argument("--geo-path", help="Local WA ZIP GeoJSON (skips download)")
    ap.add_argument("--metro", default="Seattle", help="Substring match on ZHVI Metro")
    ap.add_argument("--tolerance", type=float, default=0.0005, help="Simplify tolerance (deg)")
    ap.add_argument("--out-dir", default=str(DATA_DIR))
    args = ap.parse_args()

    print("Loading ZHVI…")
    zhvi_csv = Path(args.zhvi_path).read_text() if args.zhvi_path else _fetch_text(args.zhvi_url)
    print("Loading ZIP GeoJSON…")
    geo_text = Path(args.geo_path).read_text() if args.geo_path else _fetch_text(args.geo_url)

    payload, values = build_zhvi(zhvi_csv, args.metro)
    geojson = build_geojson(geo_text, values, args.tolerance)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "seattle_zhvi.json").write_text(json.dumps(payload), encoding="utf-8")
    (out_dir / "seattle_zcta.geojson").write_text(json.dumps(geojson), encoding="utf-8")
    print(f"Wrote {out_dir / 'seattle_zhvi.json'} and {out_dir / 'seattle_zcta.geojson'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
