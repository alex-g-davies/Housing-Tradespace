import type { CommuteVariation, RegionInfo, ZipValue } from "../api/client";
import type { ColorStop, MetricDef, MetricKey } from "../config";
import AboutPanel from "./AboutPanel";
import AddressSearch from "./AddressSearch";
import BudgetInput from "./BudgetInput";
import CommuteControl from "./CommuteControl";
import Legend from "./Legend";
import MetricSwitcher from "./MetricSwitcher";
import RegionPicker from "./RegionPicker";
import TopMovers from "./TopMovers";

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
  onAddressLocated: (lat: number, lon: number, label: string) => void;
  /** Bias point for address search — the selected region's center. */
  searchProximity: { lat: number; lon: number } | null;
  records: Map<string, ZipValue>;
  onZipChosen: (zip: string) => void;
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
  onAddressLocated,
  searchProximity,
  records,
  onZipChosen,
}: Props) {
  return (
    <div className="panel">
      <img src="/brand/logo.png" alt="tradespace" className="panel-logo" />

      <div className="panel__section">
        {regions.length > 0 && (
          <RegionPicker regions={regions} state={state} onStateChange={onStateChange} />
        )}
        <BudgetInput budget={budget} onChange={onBudgetChange} />
      </div>

      <div className="panel__section work">
        <span className="work__label">Work location</span>
        <AddressSearch onLocated={onAddressLocated} proximity={searchProximity} />
        <span className="work__hint">Drag the pin to move it, or search an address</span>
      </div>

      <div className="panel__section">
        <CommuteControl
          minutes={minutes}
          onMinutesChange={onMinutesChange}
          variation={variation}
        />
      </div>

      <div className="panel__section">
        <span className="section-label">Shade map by</span>
        <MetricSwitcher active={metricKey} onChange={onMetricChange} />
        <Legend metric={activeMetric} stops={stops} budget={budget} />
        <TopMovers records={records} onZipChosen={onZipChosen} />
      </div>

      <p className="panel-foot">
        Hover a ZIP for quick stats, click for details · {minutes}-min drive-time overlay
      </p>
      <AboutPanel />
    </div>
  );
}
