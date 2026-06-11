import { useCallback, useEffect, useMemo, useState } from "react";

import { type CommuteVariation, type RegionInfo, getRegions } from "./api/client";
import ControlsPanel from "./components/ControlsPanel";
import MapView from "./components/MapView";
import Onboarding from "./components/Onboarding";
import Toasts from "./components/Toasts";
import ZipDetailPanel, { type ZipContext } from "./components/ZipDetailPanel";
import {
  type ColorStop,
  DEFAULT_MINUTES,
  DEFAULT_STATE,
  DEFAULT_WORK,
  METRICS,
  type MetricKey,
  SCENARIO_STYLES,
  type WorkLocation,
} from "./config";
import { useMapData } from "./hooks/useMapData";
import { resolveStops } from "./lib/colorScale";
import { centroidsByZip, scenariosContaining } from "./lib/geo";
import { deltaPct, percentileRank, stateMedian } from "./lib/zipStats";

export default function App() {
  const [budget, setBudget] = useState(0);
  const [metricKey, setMetricKey] = useState<MetricKey>("value");
  const [minutes, setMinutes] = useState<number>(DEFAULT_MINUTES);
  const [work, setWork] = useState<WorkLocation>(DEFAULT_WORK);
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [stateCode, setStateCode] = useState<string>(DEFAULT_STATE);
  // Bumped on programmatic work moves (address / reset) so the map flies there.
  const [recenter, setRecenter] = useState(0);
  // Click-to-select (009 R1): drives the outline + detail panel.
  const [selectedZip, setSelectedZip] = useState<string | null>(null);

  const activeMetric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const { geojson, isochrone, records, loading, error, notices } = useMapData(
    stateCode,
    work,
    minutes,
  );

  const [regionsFailed, setRegionsFailed] = useState(false);
  useEffect(() => {
    getRegions()
      .then((r) => {
        setRegions(r);
        setRegionsFailed(false);
      })
      .catch(() => setRegionsFailed(true));
  }, []);

  const region = regions.find((r) => r.code === stateCode) ?? null;

  // Adaptive ramp: MapView reports breaks computed from the ZIPs currently in
  // view (viewport-adaptive); until it does, fall back to the whole-region
  // quantiles so the legend has something to show.
  const recordStops = useMemo(() => {
    const values = [...records.values()].map(
      (r) => (r as unknown as Record<string, number | null>)[activeMetric.property] ?? null,
    );
    return resolveStops(activeMetric, values);
  }, [records, activeMetric]);
  const [viewportStops, setViewportStops] = useState<ColorStop[] | null>(null);
  useEffect(() => {
    setViewportStops(null); // reset when the metric or region changes
  }, [activeMetric, stateCode]);
  const stops = viewportStops ?? recordStops;

  const variation =
    (isochrone as { properties?: { variation?: CommuteVariation } } | null)?.properties
      ?.variation ?? null;

  // One centroid per ZIP (009): commute-reach check now, fly-to targets later.
  const centroids = useMemo(() => centroidsByZip(geojson), [geojson]);

  // Context block for the detail panel — pure computations over loaded data.
  const zipContext = useMemo<ZipContext>(() => {
    const empty: ZipContext = { percentile: null, vsStateMedianPct: null, commuteReach: null };
    if (!selectedZip) return empty;
    const record = records.get(selectedZip);
    const values = [...records.values()].map((r) => r.median_value);
    const percentile = record ? percentileRank(values, record.median_value) : null;
    const vsStateMedianPct = record
      ? deltaPct(record.median_value, stateMedian(values))
      : null;

    let commuteReach: string | null = null;
    const centroid = centroids.get(selectedZip);
    if (centroid && isochrone) {
      const contained = new Set(scenariosContaining(centroid, isochrone));
      // SCENARIO_STYLES is ordered outer (widest) -> inner; the innermost band
      // containing the ZIP center is the strongest guarantee.
      const best = [...SCENARIO_STYLES].reverse().find((s) => contained.has(s.key));
      commuteReach = best
        ? `Within the ${minutes}-min drive (${best.label.toLowerCase()}) — ZIP center`
        : `Outside the ${minutes}-min drive — ZIP center`;
    }
    return { percentile, vsStateMedianPct, commuteReach };
  }, [selectedZip, records, centroids, isochrone, minutes]);

  // Esc closes the detail panel (009 R1).
  useEffect(() => {
    if (!selectedZip) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelectedZip(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedZip]);

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
      setSelectedZip(null); // records are per-state; a stale selection is meaningless
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
        onViewportStops={setViewportStops}
        budget={budget}
        work={work}
        onWorkChange={handleWorkDrag}
        recenterSignal={recenter}
        fitBbox={region?.bbox ?? null}
        selectedZip={selectedZip}
        pinnedZip={null}
        onSelectZip={setSelectedZip}
      />
      {selectedZip && (
        <ZipDetailPanel
          zip={selectedZip}
          record={records.get(selectedZip)}
          metroLabel={region?.name ?? "Washington"}
          budget={budget}
          context={zipContext}
          onClose={() => setSelectedZip(null)}
        />
      )}
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
      <Onboarding />
      <Toasts
        messages={[
          ...notices,
          ...(regionsFailed ? ["Region list unavailable — showing Washington only"] : []),
        ]}
      />
      {loading && <div className="status">Loading map…</div>}
      {error && <div className="status status--error">Couldn’t load map data: {error}</div>}
    </div>
  );
}
