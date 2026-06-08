"""Load and validate the committed housing + geometry datasets.

The parsing functions are pure so they can be unit-tested without the app (R1):
invalid/missing ZIPs are skipped, never fatal. The join key is a 5-character
zero-padded string on both the ZHVI and ZCTA sides.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import DATA_DIR

logger = logging.getLogger(__name__)

ZHVI_FILE = "seattle_zhvi.json"
ZCTA_FILE = "seattle_zcta.geojson"


def normalize_zip(raw: Any) -> str | None:
    """Coerce a raw ZIP (int like 98101 or str like '98101') to a 5-char string.

    Returns None when it can't be made into exactly 5 digits — the top failure
    mode is silent leading-zero loss when ZIPs are stored as integers.
    """
    if raw is None:
        return None
    if isinstance(raw, float):
        if raw != raw or raw < 0:  # NaN or negative
            return None
        raw = int(raw)
    if isinstance(raw, int):
        if raw < 0:
            return None
        raw = str(raw)
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s.isdigit() or len(s) > 5:
        return None
    s = s.zfill(5)
    return s if len(s) == 5 else None


def _coerce_value(raw: Any) -> int | None:
    """Return a positive int median value, or None for missing/invalid/<=0."""
    if raw is None or isinstance(raw, bool):
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    if v != v or v <= 0:  # NaN or non-positive
        return None
    return int(round(v))


@dataclass
class ParsedHousing:
    metro: str
    as_of: str
    values: dict[str, int] = field(default_factory=dict)  # zip -> median_value
    skipped: int = 0


def parse_housing(raw: dict[str, Any]) -> ParsedHousing:
    """Validate a raw ZHVI JSON dict into a zip->value map, skipping bad rows."""
    metro = str(raw.get("metro", ""))
    as_of = str(raw.get("as_of", ""))
    values: dict[str, int] = {}
    skipped = 0
    for row in raw.get("zips", []) or []:
        z = normalize_zip(row.get("zip") if isinstance(row, dict) else None)
        v = _coerce_value(row.get("median_value") if isinstance(row, dict) else None)
        if z is None or v is None:
            skipped += 1
            continue
        values[z] = v
    if skipped:
        logger.info("parse_housing: skipped %d invalid ZHVI row(s)", skipped)
    return ParsedHousing(metro=metro, as_of=as_of, values=values, skipped=skipped)


def merge_geojson(geojson_raw: dict[str, Any], values: dict[str, int]) -> dict[str, Any]:
    """Return a FeatureCollection with normalized `zip` + merged `median_value`.

    Features whose ZIP can't be normalized are dropped (skipped, not fatal).
    `median_value` is set to the matching value, or omitted entirely when there
    is no value for that ZIP (so the frontend can guard with `['has', ...]` and
    render it as 'no data').
    """
    features_out: list[dict[str, Any]] = []
    dropped = 0
    for feat in geojson_raw.get("features", []) or []:
        props = dict(feat.get("properties") or {})
        # Accept either a pre-set `zip` or the raw Census ZCTA property.
        z = normalize_zip(props.get("zip") or props.get("ZCTA5CE20") or props.get("ZCTA5CE10"))
        if z is None:
            dropped += 1
            continue
        props["zip"] = z
        value = values.get(z)
        if value is not None:
            props["median_value"] = value
        else:
            props.pop("median_value", None)
        features_out.append({**feat, "properties": props})
    if dropped:
        logger.info("merge_geojson: dropped %d feature(s) with invalid ZIP", dropped)
    return {"type": "FeatureCollection", "features": features_out}


@dataclass
class DataStore:
    housing: ParsedHousing
    geojson: dict[str, Any]

    @classmethod
    def load(cls, data_dir: Path) -> DataStore:
        with open(data_dir / ZHVI_FILE, encoding="utf-8") as f:
            housing = parse_housing(json.load(f))
        with open(data_dir / ZCTA_FILE, encoding="utf-8") as f:
            geojson = merge_geojson(json.load(f), housing.values)
        logger.info(
            "DataStore loaded: %d ZIP values, %d geojson features",
            len(housing.values),
            len(geojson["features"]),
        )
        return cls(housing=housing, geojson=geojson)


@lru_cache
def get_data_store() -> DataStore:
    """Cached store loaded from the committed data dir (overridable in tests)."""
    return DataStore.load(DATA_DIR)
