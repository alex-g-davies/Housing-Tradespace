import { useCallback, useEffect, useMemo, useState } from "react";

import { type CommuteVariation, type RegionInfo, getRegions } from "./api/client";
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
import { resolveStops } from "./lib/colorScale";

const DEFAULT_STATE = "WA";

export default function App() {
  const [budget, setBudget] = useState(0);
  const [metricKey, setMetricKey] = useState<MetricKey>("value");
  const [minutes, setMinutes] = useState<number>(DEFAULT_MINUTES);
  const [work, setWork] = useState<WorkLocation>(DEFAULT_WORK);
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [stateCode, setStateCode] = useState<string>(DEFAULT_STATE);
  // Bumped on programmatic work moves (address / reset) so the map flies there.
  const [recenter, setRecenter] = useState(0);

  const activeMetric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const { geojson, isochrone, records, loading, error } = useMapData(stateCode, work, minutes);

  useEffect(() => {
    getRegions()
      .then(setRegions)
      .catch(() => {});
  }, []);

  const region = regions.find((r) => r.code === stateCode) ?? null;

  // Per-region adaptive ramp: quantile breaks from this region's distribution
  // (a fixed national scale would wash out cheap/pricey states).
  const stops = useMemo(() => {
    const values = [...records.values()].map(
      (r) => (r as unknown as Record<string, number | null>)[activeMetric.property] ?? null,
    );
    return resolveStops(activeMetric, values);
  }, [records, activeMetric]);

  const variation =
    (isochrone as { properties?: { variation?: CommuteVariation } } | null)?.properties
      ?.variation ?? null;

  const handleWorkDrag = useCallback((lat: number, lon: number) => setWork({ lat, lon }), []);
  const handleAddressLocated = useCallback((lat: number, lon: number) => {
    setWork({ lat, lon });
    setRecenter((n) => n + 1);
  }, []);
  const handleResetWork = useCallback(() => {
    setWork(DEFAULT_WORK);
    setRecenter((n) => n + 1);
  }, []);

  const handleStateChange = useCallback(
    (code: string) => {
      setStateCode(code);
      const r = regions.find((x) => x.code === code);
      if (r?.center) setWork({ lat: r.center[1], lon: r.center[0] });
    },
    [regions],
  );

  return (
    <div className="app">
      <MapView
        geojson={geojson}
        isochrone={isochrone}
        records={records}
        activeMetric={activeMetric}
        stops={stops}
        budget={budget}
        work={work}
        onWorkChange={handleWorkDrag}
        recenterSignal={recenter}
        fitBbox={region?.bbox ?? null}
      />
      <ControlsPanel
        regions={regions}
        state={stateCode}
        onStateChange={handleStateChange}
        budget={budget}
        onBudgetChange={setBudget}
        activeMetric={activeMetric}
        stops={stops}
        metricKey={metricKey}
        onMetricChange={setMetricKey}
        minutes={minutes}
        onMinutesChange={setMinutes}
        variation={variation}
        work={work}
        onResetWork={handleResetWork}
        onAddressLocated={handleAddressLocated}
        metroLabel={region?.name ?? "Washington"}
      />
      {loading && <div className="status">Loading map…</div>}
      {error && <div className="status status--error">Couldn’t load map data: {error}</div>}
    </div>
  );
}
