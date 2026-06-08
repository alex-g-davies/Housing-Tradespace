import { COLOR_STOPS, NO_DATA_COLOR } from "../config";

interface Props {
  budget: number;
}

function formatK(value: number): string {
  return `$${Math.round(value / 1000)}k`;
}

/**
 * Color legend for the choropleth (R2). Stops come from the shared config so
 * the legend can never drift from the map fill. Shows distinct "over budget"
 * and "no data" entries; the over-budget entry appears once a budget is set (R4).
 */
export default function Legend({ budget }: Props) {
  return (
    <div className="legend" aria-label="Median home value legend">
      <div className="legend-title">Median home value</div>
      <ul className="legend-list">
        {COLOR_STOPS.map((stop, i) => {
          const next = COLOR_STOPS[i + 1];
          const label = next
            ? `${formatK(stop.value)}–${formatK(next.value)}`
            : `${formatK(stop.value)}+`;
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
        {budget > 0 && (
          <li className="legend-row">
            <span className="legend-swatch legend-swatch--faded" />
            Over budget
          </li>
        )}
      </ul>
    </div>
  );
}
