import type { MetricDef, MetricKey, WorkLocation } from "../config";
import AddressSearch from "./AddressSearch";
import BudgetInput from "./BudgetInput";
import Legend from "./Legend";
import MetricSwitcher from "./MetricSwitcher";

interface Props {
  budget: number;
  onBudgetChange: (budget: number) => void;
  activeMetric: MetricDef;
  metricKey: MetricKey;
  onMetricChange: (key: MetricKey) => void;
  work: WorkLocation;
  onResetWork: () => void;
  onAddressLocated: (lat: number, lon: number, label: string) => void;
  metroLabel: string;
}

/** Floating panel: title, budget, work-location controls, metric switcher, legend. */
export default function ControlsPanel({
  budget,
  onBudgetChange,
  activeMetric,
  metricKey,
  onMetricChange,
  work,
  onResetWork,
  onAddressLocated,
  metroLabel,
}: Props) {
  return (
    <div className="panel">
      <h1 className="panel-title">tradespace</h1>
      <p className="panel-subtitle">{metroLabel}</p>

      <BudgetInput budget={budget} onChange={onBudgetChange} />

      <div className="work">
        <span className="work__label">Work location</span>
        <AddressSearch onLocated={onAddressLocated} />
        <span className="work__coords">
          {work.lat.toFixed(4)}, {work.lon.toFixed(4)}
        </span>
        <button type="button" className="work__reset" onClick={onResetWork}>
          Reset to Museum of Flight
        </button>
        <span className="work__hint">Drag the pin to move it, or search an address</span>
      </div>

      <span className="work__label">Shade map by</span>
      <MetricSwitcher active={metricKey} onChange={onMetricChange} />
      <Legend metric={activeMetric} budget={budget} />

      <p className="panel-foot">
        Hover or tap a ZIP for its metrics · 30-min drive-time overlay
      </p>
    </div>
  );
}
