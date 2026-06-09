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
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

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

# Natural Earth water (public domain) for trimming ZIP polygons to land. Pure
# GeoJSON, so no shapefile library is needed. ne_10m_ocean covers Puget Sound;
# ne_10m_lakes_north_america contains Lake Washington.
NE_OCEAN_URL = (
    "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/"
    "master/10m/physical/ne_10m_ocean.json"
)
NE_LAKES_URL = (
    "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/"
    "master/10m/physical/ne_10m_lakes_north_america.json"
)
# Drop clipped slivers below this area (deg²) ≈ 0.17 km² at 47.6°N.
SLIVER_MIN_DEG2 = 2e-5

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


def _polys_above(geom, sliver_min: float):
    """Polygonal parts of `geom` at or above `sliver_min` area."""
    parts = getattr(geom, "geoms", [geom])
    return [p for p in parts if p.geom_type == "Polygon" and p.area >= sliver_min]


def clip_to_land(
    geom,
    water,
    sliver_min: float = SLIVER_MIN_DEG2,
    tolerance: float = 0.0005,
    min_keep_fraction: float = 0.2,
):
    """Subtract `water` from a ZIP geometry, drop sliver parts, and simplify.

    If clipping would erase most of the ZIP (e.g. an island inside a lake/sound
    that the coarse Natural Earth mask doesn't cut out — Mercer Island, Fox
    Island), the ORIGINAL geometry is kept instead of deleting the ZIP. Pure (no
    network) so it is unit-testable. Returns None only for a degenerate input."""
    original = geom.buffer(0)  # repair invalid rings
    clipped = original if water is None else original.difference(water)
    # Guard islands the mask can't resolve: keep the original if too little remains.
    if water is not None and (
        clipped.is_empty or clipped.area < min_keep_fraction * original.area
    ):
        clipped = original

    parts = _polys_above(clipped, sliver_min) or _polys_above(original, sliver_min)
    if not parts:
        return None
    geom = parts[0] if len(parts) == 1 else unary_union(parts)
    return geom.simplify(tolerance, preserve_topology=True)


def load_water_mask(bbox):
    """Build a water mask (shapely geom) for `bbox` from Natural Earth ocean +
    North American lakes. Returns None if the download fails (build stays unclipped)."""
    try:
        ocean = json.loads(_fetch_text(NE_OCEAN_URL))
        lakes = json.loads(_fetch_text(NE_LAKES_URL))
    except httpx.HTTPError as e:
        print(f"Water mask download failed ({e}); skipping clip")
        return None
    ocean_geom = unary_union([shape(f["geometry"]) for f in ocean.get("features", [])]).buffer(0)
    parts = [ocean_geom.intersection(bbox)]
    lake_count = 0
    for f in lakes.get("features", []):
        g = shape(f["geometry"])
        if g.intersects(bbox):
            parts.append(g.intersection(bbox))
            lake_count += 1
    parts = [p for p in parts if not p.is_empty]
    if not parts:
        return None
    print(f"Water mask: ocean + {lake_count} lake(s) within bbox")
    return unary_union(parts).buffer(0)


def matched_bounds(geo_text: str, scalars: dict[str, dict], margin: float = 0.05):
    """Bounding box (shapely) of the ZIP features we keep, padded by `margin`."""
    raw = json.loads(geo_text)
    geoms = []
    for feat in raw.get("features", []):
        props = feat.get("properties") or {}
        for key in ZIP_PROP_CANDIDATES:
            if key in props:
                z = normalize_zip(props[key])
                if z and z in scalars:
                    geoms.append(shape(feat["geometry"]))
                break
    if not geoms:
        return None
    minx, miny, maxx, maxy = unary_union(geoms).bounds
    return box(minx - margin, miny - margin, maxx + margin, maxy + margin)


def build_geojson(geo_text: str, scalars: dict[str, dict], tolerance: float, water=None) -> dict:
    """Keep features for ZIPs we have, clip to land + simplify, merge scalar metrics."""
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
        geom = clip_to_land(shape(feat["geometry"]), water, tolerance=tolerance)
        if geom is None:
            continue
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
    ap.add_argument("--no-water-clip", action="store_true", help="Skip trimming ZIPs to land")
    ap.add_argument(
        "--clip-existing",
        action="store_true",
        help="Only re-trim the committed seattle_zcta.geojson to land (preserves "
        "properties; no ZHVI/Redfin download)",
    )
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    if args.clip_existing:
        return _clip_existing(out_dir, args.tolerance)

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
    water = None
    if not args.no_water_clip:
        bbox = matched_bounds(geo_text, scalars)
        if bbox is not None:
            print("Loading water mask…")
            water = load_water_mask(bbox)
    geojson = build_geojson(geo_text, scalars, args.tolerance, water=water)

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "seattle_zhvi.json").write_text(json.dumps(payload), encoding="utf-8")
    (out_dir / "seattle_zcta.geojson").write_text(json.dumps(geojson), encoding="utf-8")
    print(f"Wrote {out_dir / 'seattle_zhvi.json'} and {out_dir / 'seattle_zcta.geojson'}")
    return 0


def _clip_existing(out_dir: Path, tolerance: float) -> int:
    """Re-trim the committed ZIP GeoJSON to land in place, preserving properties."""
    path = out_dir / "seattle_zcta.geojson"
    geo = json.loads(path.read_text(encoding="utf-8"))
    feats = geo.get("features", [])
    bounds = unary_union([shape(f["geometry"]) for f in feats]).bounds
    bbox = box(bounds[0] - 0.05, bounds[1] - 0.05, bounds[2] + 0.05, bounds[3] + 0.05)
    print("Loading water mask…")
    water = load_water_mask(bbox)
    if water is None:
        raise SystemExit("Could not build water mask; aborting clip")

    kept = []
    for feat in feats:
        geom = clip_to_land(shape(feat["geometry"]), water, tolerance=tolerance)
        if geom is None:
            print(f"  dropped {feat['properties'].get('zip')} (all water)")
            continue
        kept.append({**feat, "geometry": mapping(geom)})
    geo["features"] = kept
    path.write_text(json.dumps(geo), encoding="utf-8")
    print(f"Clipped {len(kept)}/{len(feats)} ZIP polygons to land -> {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
