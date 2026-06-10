import type { CommuteVariation, RegionInfo } from "../api/client";
import type { ColorStop, MetricDef, MetricKey, WorkLocation } from "../config";
import AddressSearch from "./AddressSearch";
import BudgetInput from "./BudgetInput";
import CommuteControl from "./CommuteControl";
import Legend from "./Legend";
import MetricSwitcher from "./MetricSwitcher";
import RegionPicker from "./RegionPicker";

interface Props {
  regions: RegionInfo[];
  state: string;
  onStateChange: (code: string) => void;
  budget: number;
  onBudgetChange: (budget: number) => void;
  activeMetric: MetricDef;
  stops: ColorStop[];
  metricKey: MetricKey;
  onMetricChange: (key: MetricKey) => void;
  minutes: number;
  onMinutesChange: (minutes: number) => void;
  variation: CommuteVariation | null;
  work: WorkLocation;
  onResetWork: () => void;
  onAddressLocated: (lat: number, lon: number, label: string) => void;
  metroLabel: string;
}

/** Floating panel: title, region picker, budget, work controls, switcher, legend. */
export default function ControlsPanel({
  regions,
  state,
  onStateChange,
  budget,
  onBudgetChange,
  activeMetric,
  stops,
  metricKey,
  onMetricChange,
  minutes,
  onMinutesChange,
  variation,
  work,
  onResetWork,
  onAddressLocated,
  metroLabel,
}: Props) {
  return (
    <div className="panel">
      <h1 className="panel-title">tradespace</h1>
      <p className="panel-subtitle">{metroLabel}</p>

      {regions.length > 0 && (
        <RegionPicker regions={regions} state={state} onStateChange={onStateChange} />
      )}

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

      <CommuteControl
        minutes={minutes}
        onMinutesChange={onMinutesChange}
        variation={variation}
      />

      <span className="section-label">Shade map by</span>
      <MetricSwitcher active={metricKey} onChange={onMetricChange} />
      <Legend metric={activeMetric} stops={stops} budget={budget} />

      <p className="panel-foot">
        Hover or tap a ZIP for its metrics · 30-min drive-time overlay
      </p>
    </div>
  );
}
