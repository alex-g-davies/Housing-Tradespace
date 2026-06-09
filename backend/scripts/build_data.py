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
import re
import sys
import tempfile
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
# Optional $/sqft source (large: >4 GB uncompressed). Off unless --redfin-url or
# --redfin-path is given. `median_ppsf` is LIST price/sqft of active listings.
REDFIN_URL = (
    "https://redfin-public-data.s3.us-west-2.amazonaws.com/"
    "redfin_market_tracker/zip_code_market_tracker.tsv000.gz"
)
_ZIP_RE = re.compile(r"\d{5}")

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


# --- pure metric helpers (unit-testable) ---------------------------------------

def pct_change(old: float, new: float) -> float | None:
    """Percent change old->new, rounded to 1 dp. None if old is non-positive."""
    if old is None or new is None or old <= 0:
        return None
    return round((new - old) / old * 100, 1)


def cagr(old: float, new: float, years: float) -> float | None:
    """Compound annual growth rate (%) over `years`, rounded to 1 dp."""
    if old is None or new is None or old <= 0 or new <= 0 or years <= 0:
        return None
    return round(((new / old) ** (1 / years) - 1) * 100, 1)


def quarter_label(date_str: str) -> str:
    """'2026-04-30' -> '2026-Q2'."""
    year = date_str[:4]
    month = int(date_str[5:7])
    return f"{year}-Q{(month - 1) // 3 + 1}"


def downsample_quarterly(date_cols, row, max_points: int = 20) -> list[list]:
    """One [quarter_label, value] point per quarter (last month in the quarter),
    keeping the most recent `max_points` quarters — a compact sparkline series."""
    by_quarter: dict[str, int] = {}
    for col in date_cols:
        v = row[col]
        if pd.isna(v) or v <= 0:
            continue
        by_quarter[quarter_label(col)] = int(round(float(v)))  # later month wins
    items = list(by_quarter.items())[-max_points:]
    return [[q, v] for q, v in items]


def build_zhvi(zhvi_csv: str, metro_substr: str) -> tuple[dict, list[dict]]:
    """Filter ZHVI to the metro and return (json_payload, records).

    Each record carries median_value plus the ZHVI-derived metrics (yoy_pct,
    cagr5_pct, history); optional metrics are omitted when unavailable."""
    df = pd.read_csv(StringIO(zhvi_csv))
    date_cols = [c for c in df.columns if c[:4].isdigit() and "-" in c]
    if not date_cols:
        raise SystemExit("No date columns found in ZHVI CSV — format changed?")
    latest = date_cols[-1]
    # Columns are monthly and contiguous, so index positionally: 12 months and
    # 60 months (5 years) before the latest.
    col_12 = date_cols[-13] if len(date_cols) >= 13 else None
    col_60 = date_cols[-61] if len(date_cols) >= 61 else None

    sub = df[df["Metro"].fillna("").str.contains(metro_substr, case=False)]
    records: list[dict] = []
    skipped = 0
    for _, row in sub.iterrows():
        z = normalize_zip(row["RegionName"])
        v = row[latest]
        if z is None or pd.isna(v) or v <= 0:
            skipped += 1
            continue
        value = float(v)
        rec: dict = {"zip": z, "median_value": int(round(value))}

        if col_12 is not None and not pd.isna(row[col_12]):
            yoy = pct_change(float(row[col_12]), value)
            if yoy is not None:
                rec["yoy_pct"] = yoy
        if col_60 is not None and not pd.isna(row[col_60]):
            c5 = cagr(float(row[col_60]), value, 5)
            if c5 is not None:
                rec["cagr5_pct"] = c5
        history = downsample_quarterly(date_cols, row)
        if history:
            rec["history"] = history
        records.append(rec)

    records.sort(key=lambda r: r["zip"])
    metro_name = sub["Metro"].dropna().iloc[0] if not sub.empty else metro_substr
    payload = {"metro": str(metro_name), "as_of": latest, "zips": records}
    print(f"ZHVI: {len(records)} ZIPs kept, {skipped} skipped (as_of {latest})")
    return payload, records


# Scalar metrics merged into the choropleth GeoJSON (history is NOT — MapLibre
# stringifies nested feature properties; the popup reads history from /api/housing).
GEOJSON_METRICS = ("median_value", "yoy_pct", "ppsf")


def build_geojson(geo_text: str, scalars: dict[str, dict], tolerance: float) -> dict:
    """Keep features for ZIPs we have, simplify geometry, merge scalar metrics."""
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
        if z is None or z not in scalars:
            continue
        geom = shape(feat["geometry"]).simplify(tolerance, preserve_topology=True)
        out_props = {"zip": z}
        for metric in GEOJSON_METRICS:
            val = scalars[z].get(metric)
            if val is not None:
                out_props[metric] = val
        features_out.append(
            {"type": "Feature", "properties": out_props, "geometry": mapping(geom)}
        )
    print(f"GeoJSON: {len(features_out)} ZIP polygons kept (tolerance {tolerance})")
    return {"type": "FeatureCollection", "features": features_out}


def stream_download(url: str, dest: Path) -> None:
    """Stream a (large) URL to a file without holding it all in memory."""
    with httpx.stream("GET", url, timeout=None, follow_redirects=True) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)


def build_redfin(path: str, zips: set[str], chunksize: int = 200_000) -> dict[str, float]:
    """Parse median SOLD $/sqft (MEDIAN_PPSF) per ZIP from a Redfin
    zip_code_market_tracker .tsv.gz, keeping the latest period for All
    Residential. The zip-only file uses UPPERCASE headers; this is case-tolerant.
    Streamed in chunks because the national file is multi-GB. Returns {zip: ppsf}."""
    header = pd.read_csv(path, sep="\t", compression="gzip", nrows=0)
    by_upper = {c.upper(): c for c in header.columns}  # tolerate case
    region_c, ppsf_c = by_upper.get("REGION"), by_upper.get("MEDIAN_PPSF")
    if not region_c or not ppsf_c:
        raise SystemExit("Redfin file missing expected columns (REGION / MEDIAN_PPSF)")
    period_c, ptype_c = by_upper.get("PERIOD_END"), by_upper.get("PROPERTY_TYPE")
    usecols = [c for c in (region_c, ppsf_c, period_c, ptype_c) if c]

    latest: dict[str, tuple[str, float]] = {}  # zip -> (period_end, ppsf)
    reader = pd.read_csv(path, sep="\t", compression="gzip", usecols=usecols, chunksize=chunksize)
    for chunk in reader:
        if ptype_c:
            chunk = chunk[chunk[ptype_c] == "All Residential"]
        periods = chunk[period_c] if period_c else [""] * len(chunk)
        for region, period_end, ppsf in zip(
            chunk[region_c], periods, chunk[ppsf_c], strict=False
        ):
            if pd.isna(ppsf) or ppsf <= 0:
                continue
            m = _ZIP_RE.search(str(region))
            if not m or m.group(0) not in zips:
                continue
            z = m.group(0)
            pe = str(period_end)
            cur = latest.get(z)
            if cur is None or pe > cur[0]:  # ISO dates compare lexicographically
                latest[z] = (pe, float(ppsf))
    result = {z: round(ppsf, 1) for z, (_, ppsf) in latest.items()}
    print(f"Redfin: sold $/sqft for {len(result)} ZIPs")
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--zhvi-url", default=ZHVI_URL)
    ap.add_argument("--geo-url", default=GEO_URL)
    ap.add_argument("--zhvi-path", help="Local ZHVI CSV (skips download)")
    ap.add_argument("--geo-path", help="Local WA ZIP GeoJSON (skips download)")
    ap.add_argument("--metro", default="Seattle", help="Substring match on ZHVI Metro")
    ap.add_argument("--tolerance", type=float, default=0.0005, help="Simplify tolerance (deg)")
    ap.add_argument("--out-dir", default=str(DATA_DIR))
    ap.add_argument("--redfin-path", help="Local Redfin zip tracker .tsv.gz (for $/sqft)")
    ap.add_argument(
        "--redfin-url",
        nargs="?",
        const=REDFIN_URL,
        help=f"Download Redfin $/sqft data (large). Bare flag uses {REDFIN_URL}",
    )
    args = ap.parse_args()

    print("Loading ZHVI…")
    zhvi_csv = Path(args.zhvi_path).read_text() if args.zhvi_path else _fetch_text(args.zhvi_url)
    print("Loading ZIP GeoJSON…")
    geo_text = Path(args.geo_path).read_text() if args.geo_path else _fetch_text(args.geo_url)

    payload, records = build_zhvi(zhvi_csv, args.metro)

    # Optional Redfin $/sqft — only when a path or URL is provided.
    redfin_source = args.redfin_path
    tmp = None
    if redfin_source is None and args.redfin_url:
        print("Downloading Redfin $/sqft data (large, one-time)…")
        tmp = tempfile.NamedTemporaryFile(suffix=".tsv.gz", delete=False)
        tmp.close()
        stream_download(args.redfin_url, Path(tmp.name))
        redfin_source = tmp.name
    if redfin_source:
        ppsf = build_redfin(redfin_source, {r["zip"] for r in records})
        for r in records:
            if r["zip"] in ppsf:
                r["ppsf"] = ppsf[r["zip"]]
        if tmp:
            Path(tmp.name).unlink(missing_ok=True)

    scalars = {
        r["zip"]: {m: r.get(m) for m in GEOJSON_METRICS} for r in records
    }
    geojson = build_geojson(geo_text, scalars, args.tolerance)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "seattle_zhvi.json").write_text(json.dumps(payload), encoding="utf-8")
    (out_dir / "seattle_zcta.geojson").write_text(json.dumps(geojson), encoding="utf-8")
    print(f"Wrote {out_dir / 'seattle_zhvi.json'} and {out_dir / 'seattle_zcta.geojson'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
