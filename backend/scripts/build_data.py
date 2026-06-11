"""Preprocess raw public datasets into the small per-state files the app serves.

Run once by a human; the OUTPUTS (data/states/{ST}.geojson, data/states/{ST}.zhvi.json,
data/regions.json) are committed, the raw inputs are not. Sources are free/aggregate:

  - Zillow ZHVI by ZIP (median home value): national CSV (~122 MB), filtered + grouped by state.
  - Per-state ZIP (ZCTA) boundaries GeoJSON (OpenDataDE mirror of Census TIGER).
  - Census ACS 5-year (ZCTA level): population + median household income (spec 008).
    Optional free CENSUS_API_KEY env var lifts API limits; works keyless for our 1 call.
  - Optional Redfin zip_code_market_tracker for sold $/sqft (very large).

Usage (from backend/):
    python scripts/build_data.py                      # all states (huge: ~1 GB of downloads)
    python scripts/build_data.py --states WA,OR,CA    # just these states (dev)
    python scripts/build_data.py --states WA --redfin-url   # + national $/sqft
    python scripts/build_data.py --enrich-acs         # add ACS fields to EXISTING zhvi files
                                                      # (no ZHVI/geometry re-download)

Attribution: Zillow Research (ZHVI), U.S. Census Bureau (ZCTA geometries; ACS 5-Year
Estimates), Redfin Data Center.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from io import StringIO
from pathlib import Path

import httpx
import pandas as pd
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"

ZHVI_URL = (
    "https://files.zillowstatic.com/research/public_csvs/zhvi/"
    "Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
)
GEO_BASE = "https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/"
REDFIN_URL = (
    "https://redfin-public-data.s3.us-west-2.amazonaws.com/"
    "redfin_market_tracker/zip_code_market_tracker.tsv000.gz"
)
# ACS 5-year is the only release with ZCTA coverage; since the 2020 vintage,
# ZCTAs are a national-level geography, so one call fetches all ~33k rows.
# B01003_001E = total population, B19013_001E = median household income.
ACS_URL_TEMPLATE = (
    "https://api.census.gov/data/{year}/acs/acs5"
    "?get=B01003_001E,B19013_001E&for=zip%20code%20tabulation%20area:*"
)
ACS_FIELDS = {"B01003_001E": "population", "B19013_001E": "median_income"}
_ZIP_RE = re.compile(r"\d{5}")

# Census/OpenDataDE may key the ZIP under any of these property names.
ZIP_PROP_CANDIDATES = ("ZCTA5CE20", "ZCTA5CE10", "ZCTA5CE", "zip", "ZIP", "GEOID20")

# 2-letter state code -> OpenDataDE file slug (lowercase, underscores).
STATE_SLUGS = {
    "AL": "al_alabama",
    "AK": "ak_alaska",
    "AZ": "az_arizona",
    "AR": "ar_arkansas",
    "CA": "ca_california",
    "CO": "co_colorado",
    "CT": "ct_connecticut",
    "DE": "de_delaware",
    "DC": "dc_district_of_columbia",
    "FL": "fl_florida",
    "GA": "ga_georgia",
    "HI": "hi_hawaii",
    "ID": "id_idaho",
    "IL": "il_illinois",
    "IN": "in_indiana",
    "IA": "ia_iowa",
    "KS": "ks_kansas",
    "KY": "ky_kentucky",
    "LA": "la_louisiana",
    "ME": "me_maine",
    "MD": "md_maryland",
    "MA": "ma_massachusetts",
    "MI": "mi_michigan",
    "MN": "mn_minnesota",
    "MS": "ms_mississippi",
    "MO": "mo_missouri",
    "MT": "mt_montana",
    "NE": "ne_nebraska",
    "NV": "nv_nevada",
    "NH": "nh_new_hampshire",
    "NJ": "nj_new_jersey",
    "NM": "nm_new_mexico",
    "NY": "ny_new_york",
    "NC": "nc_north_carolina",
    "ND": "nd_north_dakota",
    "OH": "oh_ohio",
    "OK": "ok_oklahoma",
    "OR": "or_oregon",
    "PA": "pa_pennsylvania",
    "RI": "ri_rhode_island",
    "SC": "sc_south_carolina",
    "SD": "sd_south_dakota",
    "TN": "tn_tennessee",
    "TX": "tx_texas",
    "UT": "ut_utah",
    "VT": "vt_vermont",
    "VA": "va_virginia",
    "WA": "wa_washington",
    "WV": "wv_west_virginia",
    "WI": "wi_wisconsin",
    "WY": "wy_wyoming",
}


def state_name(code: str) -> str:
    """'WA' -> 'Washington'."""
    slug = STATE_SLUGS.get(code, code.lower())
    return slug.split("_", 1)[1].replace("_", " ").title() if "_" in slug else code


def _fetch_text(url: str) -> str:
    with httpx.Client(timeout=180, follow_redirects=True) as c:
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


def price_to_income(median_value: float | None, median_income: float | None) -> float | None:
    """Affordability multiple (value / household income), 1 dp. None unless both
    inputs are positive — Census sentinels and missing fields never produce a ratio."""
    if not median_value or not median_income or median_value <= 0 or median_income <= 0:
        return None
    return round(median_value / median_income, 1)


def parse_acs(rows: list[list]) -> dict[str, dict[str, int]]:
    """Parse a Census ACS JSON response (header row + data rows) into
    {zip: {population, median_income}} — fields included only when positive.

    The API encodes missing values as large negative sentinels (e.g.
    -666666666); those and non-positive values are dropped per field, never
    fatal (008 R2)."""
    if not rows or len(rows) < 2:
        return {}
    header = [str(h) for h in rows[0]]
    col = {
        name: header.index(name)
        for name in (*ACS_FIELDS, "zip code tabulation area")
        if name in header
    }
    if len(col) != len(ACS_FIELDS) + 1:
        raise SystemExit(f"ACS response missing expected columns (got {header})")

    out: dict[str, dict[str, int]] = {}
    for row in rows[1:]:
        z = normalize_zip(row[col["zip code tabulation area"]])
        if z is None:
            continue
        fields: dict[str, int] = {}
        for table, name in ACS_FIELDS.items():
            raw = row[col[table]]
            try:
                v = int(float(raw))
            except (TypeError, ValueError):
                continue
            if v > 0:
                fields[name] = v
        if fields:
            out[z] = fields
    return out


def apply_acs(records: list[dict], acs: dict[str, dict[str, int]]) -> None:
    """Merge ACS fields into ZHVI records in place and (re)compute the
    price-to-income ratio. Records without ACS data are left untouched."""
    for rec in records:
        fields = acs.get(rec["zip"])
        if not fields:
            continue
        rec.update(fields)
        ratio = price_to_income(rec.get("median_value"), fields.get("median_income"))
        if ratio is not None:
            rec["price_to_income"] = ratio


def _census_api_key() -> str:
    """CENSUS_API_KEY from the environment, falling back to backend/.env
    (gitignored — same place the Mapbox token lives)."""
    key = os.environ.get("CENSUS_API_KEY", "").strip()
    if key:
        return key
    env_file = BACKEND_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "CENSUS_API_KEY":
                return value.strip().strip("'\"")
    return ""


def fetch_acs(year: int) -> dict[str, dict[str, int]]:
    """One national ACS call. The Census API requires a (free) key:
    sign up at https://api.census.gov/data/key_signup.html and set
    CENSUS_API_KEY in the environment or backend/.env."""
    url = ACS_URL_TEMPLATE.format(year=year)
    key = _census_api_key()
    if key:
        url += f"&key={key}"
    with httpx.Client(timeout=180, follow_redirects=True) as c:
        r = c.get(url)
        r.raise_for_status()
        try:
            acs = parse_acs(r.json())
        except json.JSONDecodeError:
            # The API answers 200 with an HTML page when the key is missing/bad.
            hint = "missing/invalid CENSUS_API_KEY" if "key" in r.text.lower() else "bad response"
            raise ValueError(
                f"ACS request failed ({hint}). Get a free key at "
                "https://api.census.gov/data/key_signup.html and set CENSUS_API_KEY "
                "in the environment or backend/.env."
            ) from None
    print(f"ACS {year}: population/income for {len(acs)} ZCTAs")
    return acs


def parse_zhvi_national(zhvi_csv: str) -> tuple[str, dict[str, list[dict]]]:
    """Parse the national ZHVI CSV into (as_of, {state_code: [records]}).

    Each record carries median_value plus ZHVI-derived metrics (yoy_pct, cagr5_pct,
    history); optional metrics are omitted when unavailable."""
    df = pd.read_csv(StringIO(zhvi_csv))
    date_cols = [c for c in df.columns if c[:4].isdigit() and "-" in c]
    if not date_cols:
        raise SystemExit("No date columns found in ZHVI CSV — format changed?")
    latest = date_cols[-1]
    col_12 = date_cols[-13] if len(date_cols) >= 13 else None
    col_60 = date_cols[-61] if len(date_cols) >= 61 else None

    by_state: dict[str, list[dict]] = {}
    skipped = 0
    for _, row in df.iterrows():
        st = str(row.get("State") or "").strip().upper()
        z = normalize_zip(row["RegionName"])
        v = row[latest]
        if not st or z is None or pd.isna(v) or v <= 0:
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
        by_state.setdefault(st, []).append(rec)

    for recs in by_state.values():
        recs.sort(key=lambda r: r["zip"])
    total = sum(len(v) for v in by_state.values())
    print(
        f"ZHVI national: {total} ZIPs across {len(by_state)} states, {skipped} skipped "
        f"(as_of {latest})"
    )
    return latest, by_state


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
        features_out.append({"type": "Feature", "properties": out_props, "geometry": mapping(geom)})
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
        for region, period_end, ppsf in zip(chunk[region_c], periods, chunk[ppsf_c], strict=False):
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


def build_state(
    code: str, name: str, as_of: str, records: list[dict], geo_text: str, tolerance: float
) -> tuple[dict, dict, dict]:
    """Build (geojson, zhvi_payload, region_entry) for one state."""
    scalars = {r["zip"]: {m: r.get(m) for m in GEOJSON_METRICS} for r in records}
    geojson = build_geojson(geo_text, scalars, tolerance)
    feats = geojson["features"]
    bbox = center = None
    if feats:
        union = unary_union([shape(f["geometry"]) for f in feats])
        minx, miny, maxx, maxy = union.bounds
        bbox = [round(v, 4) for v in (minx, miny, maxx, maxy)]
        c = union.centroid
        center = [round(c.x, 4), round(c.y, 4)]
    # Only emit records whose ZIP actually rendered (has geometry), so the popup
    # lookup matches the choropleth.
    kept_zips = {f["properties"]["zip"] for f in feats}
    zips = [r for r in records if r["zip"] in kept_zips]
    payload = {"state": code, "name": name, "as_of": as_of, "zips": zips}
    region = {"code": code, "name": name, "bbox": bbox, "center": center, "zip_count": len(feats)}
    return geojson, payload, region


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--zhvi-url", default=ZHVI_URL)
    ap.add_argument("--zhvi-path", help="Local ZHVI CSV (skips download)")
    ap.add_argument("--states", help="Comma-separated state codes (default: all)")
    ap.add_argument("--tolerance", type=float, default=0.0005, help="Simplify tolerance (deg)")
    ap.add_argument("--out-dir", default=str(DATA_DIR))
    ap.add_argument("--redfin-path", help="Local Redfin zip tracker .tsv.gz (for $/sqft)")
    ap.add_argument(
        "--redfin-url",
        nargs="?",
        const=REDFIN_URL,
        help=f"Download Redfin $/sqft data (large). Bare flag uses {REDFIN_URL}",
    )
    ap.add_argument("--acs-year", type=int, default=2023, help="ACS 5-year vintage")
    ap.add_argument("--acs-path", help="Local ACS JSON response (skips download)")
    ap.add_argument("--no-acs", action="store_true", help="Skip ACS enrichment")
    ap.add_argument(
        "--enrich-acs",
        action="store_true",
        help="Only merge ACS fields into EXISTING data/states/*.zhvi.json "
        "(no ZHVI/geometry downloads; geojson untouched)",
    )
    ap.add_argument(
        "--enrich-redfin",
        action="store_true",
        help="Only merge Redfin $/sqft into EXISTING data/states/*.zhvi.json "
        "(downloads the national tracker unless --redfin-path is given)",
    )
    args = ap.parse_args()

    def load_acs() -> dict[str, dict[str, int]]:
        if args.acs_path:
            return parse_acs(json.loads(Path(args.acs_path).read_text(encoding="utf-8")))
        return fetch_acs(args.acs_year)

    def load_redfin(zips: set[str]) -> dict[str, float]:
        source = args.redfin_path
        tmp_file = None
        if source is None:
            print("Downloading Redfin $/sqft data (large, one-time)…")
            tmp_file = tempfile.NamedTemporaryFile(suffix=".tsv.gz", delete=False)
            tmp_file.close()
            stream_download(args.redfin_url or REDFIN_URL, Path(tmp_file.name))
            source = tmp_file.name
        try:
            return build_redfin(source, zips)
        finally:
            if tmp_file:
                Path(tmp_file.name).unlink(missing_ok=True)

    # In-place enrichment modes (008 R7 pattern): rewrite existing zhvi files
    # only — geometry and regions stay byte-identical.
    if args.enrich_acs or args.enrich_redfin:
        states_dir = Path(args.out_dir) / "states"
        paths = sorted(states_dir.glob("*.zhvi.json"))
        if not paths:
            raise SystemExit(f"no state files found in {states_dir}")

        acs: dict[str, dict[str, int]] = {}
        if args.enrich_acs:
            try:
                acs = load_acs()
            except (httpx.HTTPError, ValueError) as e:
                raise SystemExit(f"--enrich-acs aborted: {e}") from None

        ppsf: dict[str, float] = {}
        if args.enrich_redfin:
            all_zips: set[str] = set()
            for path in paths:
                payload = json.loads(path.read_text(encoding="utf-8"))
                all_zips.update(r["zip"] for r in payload.get("zips", []))
            try:
                ppsf = load_redfin(all_zips)
            except httpx.HTTPError as e:
                raise SystemExit(f"--enrich-redfin aborted: {e}") from None

        for path in paths:
            payload = json.loads(path.read_text(encoding="utf-8"))
            records = payload.get("zips", [])
            if args.enrich_acs:
                apply_acs(records, acs)
            if args.enrich_redfin:
                for rec in records:
                    if rec["zip"] in ppsf:
                        rec["ppsf"] = ppsf[rec["zip"]]
            path.write_text(json.dumps(payload), encoding="utf-8")
        print(f"Enriched {len(paths)} state file(s) in {states_dir}")
        return 0

    print("Loading national ZHVI…")
    zhvi_csv = Path(args.zhvi_path).read_text() if args.zhvi_path else _fetch_text(args.zhvi_url)
    as_of, by_state = parse_zhvi_national(zhvi_csv)

    if args.states:
        targets = [s.strip().upper() for s in args.states.split(",") if s.strip()]
    else:
        targets = sorted(c for c in by_state if c in STATE_SLUGS)

    # Optional Redfin $/sqft (national) — apply ppsf to records before splitting.
    redfin_source = args.redfin_path
    tmp = None
    if redfin_source is None and args.redfin_url:
        print("Downloading Redfin $/sqft data (large, one-time)…")
        tmp = tempfile.NamedTemporaryFile(suffix=".tsv.gz", delete=False)
        tmp.close()
        stream_download(args.redfin_url, Path(tmp.name))
        redfin_source = tmp.name
    if redfin_source:
        all_zips = {r["zip"] for recs in by_state.values() for r in recs}
        ppsf = build_redfin(redfin_source, all_zips)
        for recs in by_state.values():
            for r in recs:
                if r["zip"] in ppsf:
                    r["ppsf"] = ppsf[r["zip"]]
        if tmp:
            Path(tmp.name).unlink(missing_ok=True)

    # ACS population/income (008): one national fetch, merged before the
    # per-state split. Failure degrades to a build without ACS fields (R5).
    if not args.no_acs:
        try:
            acs = load_acs()
        except (httpx.HTTPError, ValueError) as e:
            print(f"ACS enrichment skipped (fetch/parse failed: {e})")
        else:
            for recs in by_state.values():
                apply_acs(recs, acs)

    out_dir = Path(args.out_dir)
    states_dir = out_dir / "states"
    states_dir.mkdir(parents=True, exist_ok=True)

    # Merge into any existing regions index so subset builds accumulate.
    regions_path = out_dir / "regions.json"
    regions: dict[str, dict] = {}
    if regions_path.exists():
        regions = {r["code"]: r for r in json.loads(regions_path.read_text(encoding="utf-8"))}

    built = 0
    for code in targets:
        if code not in STATE_SLUGS:
            print(f"  skip {code}: unknown state code")
            continue
        records = by_state.get(code)
        if not records:
            print(f"  skip {code}: no ZHVI records")
            continue
        try:
            geo_text = _fetch_text(GEO_BASE + STATE_SLUGS[code] + "_zip_codes_geo.min.json")
        except httpx.HTTPError as e:
            print(f"  skip {code}: geometry download failed ({e})")
            continue
        geojson, payload, region = build_state(
            code, state_name(code), as_of, records, geo_text, args.tolerance
        )
        (states_dir / f"{code}.geojson").write_text(json.dumps(geojson), encoding="utf-8")
        (states_dir / f"{code}.zhvi.json").write_text(json.dumps(payload), encoding="utf-8")
        regions[code] = region
        built += 1
        print(f"  {code} {region['name']}: {region['zip_count']} ZIPs")

    regions_path.write_text(
        json.dumps(sorted(regions.values(), key=lambda r: r["name"])), encoding="utf-8"
    )
    print(f"Built {built} state(s); wrote {states_dir} and {regions_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
