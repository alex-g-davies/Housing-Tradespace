import { type ColorStop, type MetricDef, NO_DATA_COLOR } from "../config";

interface Props {
  metric: MetricDef;
  stops: ColorStop[];
  budget: number;
}

/**
 * Color legend for the active metric (R2/002). `stops` are the resolved (often
 * per-region quantile) breaks shared with the map fill, so the two never drift.
 * The "over budget" entry shows whenever a budget is set.
 */
export default function Legend({ metric, stops, budget }: Props) {
  const showOverBudget = budget > 0;
  return (
    <div className="legend" aria-label={`${metric.label} legend`}>
      <div className="legend-title">{metric.label}</div>
      <ul className="legend-list">
        {stops.map((stop, i) => {
          const next = stops[i + 1];
          const label = next
            ? `${metric.format(stop.value)}–${metric.format(next.value)}`
            : `${metric.format(stop.value)}+`;
          return (
            <li key={stop.value} className="legend-row">
              <span className="legend-swatch" style={{ background: stop.color }} />
              {label}
            </li>
          );
        })}
        <li className="legend-row">
          <span className="legend-swatch" style={{ background: NO_DATA_COLOR }} />
          No data
        </li>
        {showOverBudget && (
          <li className="legend-row">
            <span className="legend-swatch legend-swatch--faded" />
            Over budget
          </li>
        )}
      </ul>
    </div>
  );
}
