import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { useGeolocate } from "./hooks/useGeolocate";
import { useMapData } from "./hooks/useMapData";
import { resolveStops } from "./lib/colorScale";
import { centroidsByZip, scenariosContaining } from "./lib/geo";
import { regionForPoint } from "./lib/locateRegion";
import { parseAppUrl, serializeAppUrl } from "./lib/urlState";
import { deltaPct, percentileRank, stateMedian } from "./lib/zipStats";

// Parsed once at startup (009 R5): seeds the initial state so a deep-linked
// region is the FIRST fetch, not a correction after a default load.
const INITIAL_URL = parseAppUrl(window.location.search);

// Geolocate only cold landings (010 R1): any recognized URL param marks an
// intentional, shareable link whose view must not be overridden.
const GEOLOCATE = Object.keys(INITIAL_URL).length === 0;

export default function App() {
  const [budget, setBudget] = useState(INITIAL_URL.budget ?? 0);
  const [metricKey, setMetricKey] = useState<MetricKey>(INITIAL_URL.metric ?? "value");
  const [minutes, setMinutes] = useState<number>(INITIAL_URL.minutes ?? DEFAULT_MINUTES);
  const [work, setWork] = useState<WorkLocation>(INITIAL_URL.work ?? DEFAULT_WORK);
  // Human-readable pin description (place name / "{State} center" / "Your
  // location"); null = manually dragged ("Custom pin location"). Never coords.
  const [workLabel, setWorkLabel] = useState<string | null>(
    INITIAL_URL.work ? null : "Washington center",
  );
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [stateCode, setStateCode] = useState<string>(INITIAL_URL.state ?? DEFAULT_STATE);
  // Bumped on programmatic work moves (address / reset) so the map flies there.
  const [recenter, setRecenter] = useState(0);
  // Click-to-select (009 R1): drives the outline + detail panel.
  const [selectedZip, setSelectedZip] = useState<string | null>(null);
  // Pin-and-compare (009 R7).
  const [pinnedZip, setPinnedZip] = useState<string | null>(null);
  // Fly target for top movers / deep links (counter pattern, 009 R5/R6).
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  // Deep-linked ZIP: applied once when its state's data has arrived.
  const pendingZipRef = useRef<string | null>(INITIAL_URL.zip ?? null);
  // Geolocated landing (010 R1): a fix arriving after the user has started
  // driving is discarded; applied at most once.
  const userTouchedRef = useRef(false);
  const geoAppliedRef = useRef(false);
  const geoFix = useGeolocate(GEOLOCATE);

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
        ? `Within a ${minutes}-min drive of work (${best.label.toLowerCase()}) — approximate`
        : `Beyond a ${minutes}-min drive of work — approximate`;
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

  // Select + fly to a ZIP (top movers, deep links).
  const selectZipAndFly = useCallback(
    (zip: string) => {
      setSelectedZip(zip);
      const centroid = centroids.get(zip);
      if (centroid) {
        setFocusPoint(centroid);
        setFocusSignal((n) => n + 1);
      }
    },
    [centroids],
  );

  // Apply a geolocation fix once regions are loaded (010 R1): switch to the
  // visitor's state with the pin at their location, silently. The WA default
  // keeps rendering until (and unless) this fires.
  useEffect(() => {
    if (!geoFix || geoAppliedRef.current || userTouchedRef.current || regions.length === 0) {
      return;
    }
    geoAppliedRef.current = true;
    const r = regionForPoint(geoFix.lat, geoFix.lon, regions);
    if (!r) return; // outside every region (e.g. abroad) -> keep the default
    setStateCode(r.code);
    setWork({ lat: geoFix.lat, lon: geoFix.lon });
    setWorkLabel("Your location");
    // Same-state fixes don't change fitBbox, so fly to the pin explicitly;
    // cross-state fixes get the region fit (it runs after and wins).
    setRecenter((n) => n + 1);
  }, [geoFix, regions]);

  // Apply the deep-linked ZIP once its state's records + geometry are in
  // (009 R5). Unknown ZIPs are dropped silently.
  useEffect(() => {
    const zip = pendingZipRef.current;
    if (!zip || records.size === 0 || centroids.size === 0) return;
    pendingZipRef.current = null;
    if (records.has(zip)) selectZipAndFly(zip);
  }, [records, centroids, selectZipAndFly]);

  // Write app state back to the URL, debounced — pin drags fire frequently and
  // replaceState (not pushState) keeps the back button pointing out of the app.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const qs = serializeAppUrl({
        state: stateCode,
        zip: selectedZip,
        budget,
        work,
        minutes,
        metric: metricKey,
      });
      window.history.replaceState(null, "", `${window.location.pathname}${qs}`);
    }, 300);
    return () => window.clearTimeout(t);
  }, [stateCode, selectedZip, budget, work, minutes, metricKey]);

  const handleWorkDrag = useCallback((lat: number, lon: number) => {
    userTouchedRef.current = true;
    setWork({ lat, lon });
    setWorkLabel(null); // dragged pins have no place name
  }, []);
  const handleAddressLocated = useCallback((lat: number, lon: number, label: string) => {
    userTouchedRef.current = true;
    setWork({ lat, lon });
    setWorkLabel(label);
    setRecenter((n) => n + 1);
  }, []);
  const handleResetWork = useCallback(() => {
    const r = regions.find((x) => x.code === stateCode);
    if (r?.center) {
      setWork({ lat: r.center[1], lon: r.center[0] });
      setWorkLabel(`${r.name} center`);
    } else {
      setWork(DEFAULT_WORK);
      setWorkLabel("Washington center");
    }
    setRecenter((n) => n + 1);
  }, [regions, stateCode]);

  const handleStateChange = useCallback(
    (code: string) => {
      userTouchedRef.current = true;
      setStateCode(code);
      setSelectedZip(null); // records are per-state; stale selections are meaningless
      setPinnedZip(null);
      const r = regions.find((x) => x.code === code);
      if (r?.center) {
        setWork({ lat: r.center[1], lon: r.center[0] });
        setWorkLabel(`${r.name} center`);
      }
    },
    [regions],
  );

  return (
    <div className="app">
      <h1 className="sr-only">tradespace — housing affordability and commute map</h1>
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
        fitInitialBounds={INITIAL_URL.state != null && INITIAL_URL.zip == null}
        selectedZip={selectedZip}
        pinnedZip={pinnedZip}
        onSelectZip={setSelectedZip}
        focusPoint={focusPoint}
        focusSignal={focusSignal}
      />
      {selectedZip && (
        <ZipDetailPanel
          zip={selectedZip}
          record={records.get(selectedZip)}
          metroLabel={region?.name ?? stateCode}
          budget={budget}
          context={zipContext}
          onClose={() => setSelectedZip(null)}
          pinnedZip={pinnedZip}
          pinnedRecord={pinnedZip ? records.get(pinnedZip) : undefined}
          onPin={() => setPinnedZip(selectedZip)}
          onUnpin={() => setPinnedZip(null)}
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
        workLabel={workLabel}
        onResetWork={handleResetWork}
        onAddressLocated={handleAddressLocated}
        metroLabel={region?.name ?? stateCode}
        searchProximity={region?.center ? { lat: region.center[1], lon: region.center[0] } : null}
        records={records}
        onZipChosen={selectZipAndFly}
      />
      <Onboarding />
      <Toasts
        messages={[
          ...notices,
          ...(regionsFailed ? [`Region list unavailable — showing ${stateCode} only`] : []),
        ]}
      />
      {loading && <div className="status">Loading map…</div>}
      {error && <div className="status status--error">Couldn’t load map data: {error}</div>}
    </div>
  );
}
