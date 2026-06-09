import { useCallback, useState } from "react";

import type { CommuteVariation } from "./api/client";
import ControlsPanel from "./components/ControlsPanel";
import MapView from "./components/MapView";
import {
  DEFAULT_MINUTES,
  DEFAULT_WORK,
  METRICS,
  type MetricKey,
  type WorkLocation,
} from "./config";
import { useMapData } from "./hooks/useMapData";

export default function App() {
  const [budget, setBudget] = useState(0);
  const [metricKey, setMetricKey] = useState<MetricKey>("value");
  const [minutes, setMinutes] = useState<number>(DEFAULT_MINUTES);
  const [work, setWork] = useState<WorkLocation>(DEFAULT_WORK);
  const activeMetric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  // Bumped whenever the work point changes programmatically (address / reset) so
  // the map flies to it. Dragging the pin does NOT bump this — no jarring recenter.
  const [recenter, setRecenter] = useState(0);
  const { geojson, isochrone, records, loading, error } = useMapData(work, minutes);

  // The commute variation summary rides on the isochrone collection's properties
  // (a non-standard top-level field, so the FeatureCollection is cast).
  const variation =
    (isochrone as { properties?: { variation?: CommuteVariation } } | null)?.properties
      ?.variation ?? null;

  const handleWorkDrag = useCallback((lat: number, lon: number) => {
    setWork({ lat, lon });
  }, []);

  const handleAddressLocated = useCallback((lat: number, lon: number) => {
    setWork({ lat, lon });
    setRecenter((n) => n + 1);
  }, []);

  const handleResetWork = useCallback(() => {
    setWork(DEFAULT_WORK);
    setRecenter((n) => n + 1);
  }, []);

  return (
    <div className="app">
      <MapView
        geojson={geojson}
        isochrone={isochrone}
        records={records}
        activeMetric={activeMetric}
        budget={budget}
        work={work}
        onWorkChange={handleWorkDrag}
        recenterSignal={recenter}
      />
      <ControlsPanel
        budget={budget}
        onBudgetChange={setBudget}
        activeMetric={activeMetric}
        metricKey={metricKey}
        onMetricChange={setMetricKey}
        minutes={minutes}
        onMinutesChange={setMinutes}
        variation={variation}
        work={work}
        onResetWork={handleResetWork}
        onAddressLocated={handleAddressLocated}
        metroLabel="Seattle–Tacoma–Bellevue, WA"
      />
      {loading && <div className="status">Loading map…</div>}
      {error && <div className="status status--error">Couldn’t load map data: {error}</div>}
    </div>
  );
}
