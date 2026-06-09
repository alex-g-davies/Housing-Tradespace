import { type MetricDef, NO_DATA_COLOR } from "../config";

interface Props {
  metric: MetricDef;
  budget: number;
}

/**
 * Color legend for the active metric (R2/002). Stops + formatter come from the
 * metric definition so the legend can never drift from the map fill. The budget
 * de-emphasis applies on every metric, so the "over budget" entry is shown
 * whenever a budget is set (not just on the value metric).
 */
export default function Legend({ metric, budget }: Props) {
  const showOverBudget = budget > 0;
  return (
    <div className="legend" aria-label={`${metric.label} legend`}>
      <div className="legend-title">{metric.label}</div>
      <ul className="legend-list">
        {metric.stops.map((stop, i) => {
          const next = metric.stops[i + 1];
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
