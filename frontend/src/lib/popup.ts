// Build the hover/tap popup HTML for a ZIP. Pure (returns a string) so it can be
// fed to MapLibre's setHTML and unit-tested without a map.

import type { ZipValue } from "../api/client";
import { formatPct, formatPpsf, formatUsd } from "./format";
import { buildSparklineSvg } from "./sparkline";

export function buildZipPopupHtml(zip: string, rec: ZipValue | undefined): string {
  const rows: string[] = [`<div class="tip__zip">ZIP ${zip || "—"}</div>`];

  if (!rec) {
    rows.push('<div class="tip__val">No price data</div>');
    return `<div class="tip">${rows.join("")}</div>`;
  }

  rows.push(`<div class="tip__val">${formatUsd(rec.median_value)}</div>`);

  const metrics: string[] = [];
  if (rec.yoy_pct != null) {
    const dir = rec.yoy_pct >= 0 ? "up" : "down";
    const arrow = rec.yoy_pct >= 0 ? "▲" : "▼";
    metrics.push(
      `<span class="tip__metric tip__metric--${dir}">${arrow} ${formatPct(rec.yoy_pct)} YoY</span>`,
    );
  }
  if (rec.cagr5_pct != null) {
    metrics.push(`<span class="tip__metric">${formatPct(rec.cagr5_pct)}/yr · 5yr</span>`);
  }
  if (metrics.length) rows.push(`<div class="tip__row">${metrics.join("")}</div>`);

  rows.push(
    `<div class="tip__ppsf">${
      rec.ppsf != null ? `${formatPpsf(rec.ppsf)} sold` : "$/sqft: n/a"
    }</div>`,
  );

  const spark = buildSparklineSvg(rec.history);
  if (spark) rows.push(spark);

  return `<div class="tip">${rows.join("")}</div>`;
}
