import { METRICS, type MetricKey } from "../config";

interface Props {
  active: MetricKey;
  onChange: (key: MetricKey) => void;
}

/** Segmented control to choose which metric the choropleth shades by. */
export default function MetricSwitcher({ active, onChange }: Props) {
  return (
    <div className="switcher" role="group" aria-label="Shade map by">
      {METRICS.map((m) => (
        <button
          key={m.key}
          type="button"
          className={m.key === active ? "switcher__btn switcher__btn--active" : "switcher__btn"}
          aria-pressed={m.key === active}
          onClick={() => onChange(m.key)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
