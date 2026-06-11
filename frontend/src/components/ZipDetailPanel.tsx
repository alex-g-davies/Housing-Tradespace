import type { ZipValue } from "../api/client";
import { formatCount, formatPct, formatRatio, formatUsd } from "../lib/format";
import PriceChart from "./PriceChart";

export interface ZipContext {
  /** Percent of the state's ZIPs at or below this ZIP's median value. */
  percentile: number | null;
  /** This ZIP's value vs the state median, signed percent. */
  vsStateMedianPct: number | null;
  /** Human-readable commute-reach line, or null when no isochrone is loaded. */
  commuteReach: string | null;
}

interface Props {
  zip: string;
  record: ZipValue | undefined;
  metroLabel: string;
  budget: number;
  context: ZipContext;
  onClose: () => void;
}

function budgetBadge(budget: number, value: number | undefined) {
  if (!budget || value == null) return null;
  const diff = budget - value;
  const cls = diff >= 0 ? "zip-detail__badge--under" : "zip-detail__badge--over";
  const text =
    diff >= 0
      ? `Under budget by ${formatUsd(diff)}`
      : `Over budget by ${formatUsd(-diff)}`;
  return <span className={`zip-detail__badge ${cls}`}>{text}</span>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="zip-detail__metric">
      <span className="zip-detail__metric-label">{label}</span>
      <span className={`zip-detail__metric-value${tone ? ` ${tone}` : ""}`}>{value}</span>
    </div>
  );
}

/** Deep-dive panel for the selected ZIP (009 R2). Every field degrades to "—"
 * so the panel works on data built without ACS (R9). */
export default function ZipDetailPanel({
  zip,
  record,
  metroLabel,
  budget,
  context,
  onClose,
}: Props) {
  const yoy = record?.yoy_pct ?? null;
  return (
    <aside className="zip-detail" aria-label={`Details for ZIP ${zip}`}>
      <header className="zip-detail__head">
        <div>
          <h2 className="zip-detail__title">ZIP {zip}</h2>
          <p className="zip-detail__sub">{metroLabel}</p>
        </div>
        <button type="button" className="zip-detail__close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>

      <p className="zip-detail__value">
        {record ? formatUsd(record.median_value) : "No price data"}
      </p>
      {budgetBadge(budget, record?.median_value)}

      <div className="zip-detail__metrics">
        <Metric
          label="YoY"
          value={yoy == null ? "—" : formatPct(yoy)}
          tone={yoy == null ? undefined : yoy >= 0 ? "tip__metric--up" : "tip__metric--down"}
        />
        <Metric
          label="5-yr CAGR"
          value={record?.cagr5_pct == null ? "—" : `${formatPct(record.cagr5_pct)}/yr`}
        />
        <Metric
          label="$/sqft sold"
          value={record?.ppsf == null ? "—" : `$${Math.round(record.ppsf)}`}
        />
      </div>

      <div className="zip-detail__metrics">
        <Metric label="Population" value={formatCount(record?.population)} />
        <Metric
          label="HH income"
          value={record?.median_income == null ? "—" : formatUsd(record.median_income)}
        />
        <Metric label="Price ÷ income" value={formatRatio(record?.price_to_income)} />
      </div>

      <PriceChart history={record?.history ?? null} />

      <div className="zip-detail__context">
        {context.percentile != null && (
          <p>
            Pricier than <strong>{context.percentile}%</strong> of {metroLabel} ZIPs
            {context.vsStateMedianPct != null && (
              <>
                {" "}
                · <strong>{formatPct(context.vsStateMedianPct)}</strong> vs state median
              </>
            )}
          </p>
        )}
        {context.commuteReach && <p>{context.commuteReach}</p>}
      </div>
    </aside>
  );
}
