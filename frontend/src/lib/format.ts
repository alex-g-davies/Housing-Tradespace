// Shared value formatting so the legend, popups, and panel stay consistent.

/** Full currency, e.g. 937500 -> "$937,500". */
export function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Compact currency for tight UI, e.g. 937500 -> "$938k". */
export function formatUsdCompact(value: number): string {
  return `$${Math.round(value / 1000)}k`;
}

/** Signed percent to 1 dp, e.g. 4.2 -> "+4.2%", -1.5 -> "-1.5%". */
export function formatPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** Price per square foot, e.g. 612 -> "$612/sqft". */
export function formatPpsf(value: number): string {
  return `$${Math.round(value)}/sqft`;
}
