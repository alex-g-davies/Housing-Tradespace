// Pure per-state statistics for the ZIP detail panel and top-movers list
// (spec 009 R2/R6). All inputs come from the in-memory records map.

import type { ZipValue } from "../api/client";

/** Percent of values <= v (0–100, whole number). Null for empty input. */
export function percentileRank(values: number[], v: number): number | null {
  if (values.length === 0) return null;
  const below = values.filter((x) => x <= v).length;
  return Math.round((below / values.length) * 100);
}

/** Median of a numeric list. Null for empty input. */
export function stateMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Percent difference of a vs base, 1 dp (e.g. 110 vs 100 -> +10.0). */
export function deltaPct(a: number | null, base: number | null): number | null {
  if (a == null || base == null || base <= 0) return null;
  return Math.round(((a - base) / base) * 1000) / 10;
}

export interface Movers {
  gainers: ZipValue[];
  losers: ZipValue[];
}

/** Top-n YoY gainers (desc) and losers (asc) among ZIPs that have a YoY value.
 * States with sparse data return shorter (possibly empty) lists. */
export function topMovers(records: Map<string, ZipValue>, n = 5): Movers {
  const withYoy = [...records.values()].filter((r) => r.yoy_pct != null);
  const desc = [...withYoy].sort((a, b) => b.yoy_pct! - a.yoy_pct!);
  return { gainers: desc.slice(0, n), losers: desc.slice(-n).reverse() };
}
