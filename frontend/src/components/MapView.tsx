import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";

import {
  BASEMAP_STYLE_URL,
  IN_BUDGET_OPACITY,
  MAP_CENTER,
  MAP_ZOOM,
  type MetricDef,
  OVER_BUDGET_OPACITY,
  SCENARIO_STYLES,
  type ColorStop,
  WORK_MARKER_COLOR,
  type WorkLocation,
} from "../config";
import type { ZipValue } from "../api/client";
import {
  computeQuantileStops,
  fillColorExpression,
  fillOpacityExpression,
  metricValuesFromFeatures,
} from "../lib/colorScale";
import { buildZipPopupHtml } from "../lib/popup";

interface Props {
  geojson: FeatureCollection | null;
  isochrone: FeatureCollection | null;
  records: Map<string, ZipValue>;
  activeMetric: MetricDef;
  /** Reports the resolved (viewport-adaptive) ramp stops up for the legend. */
  onViewportStops: (stops: ColorStop[]) => void;
  budget: number;
  work: WorkLocation;
  onWorkChange: (lat: number, lon: number) => void;
  /** Increment to fly the map to the current work location (address / reset). */
  recenterSignal: number;
  /** Region bounds to fit when the selected state changes (national). */
  fitBbox: [number, number, number, number] | null;
}

const ZIP_SOURCE = "zips";
const ISO_SOURCE = "isochrone";
const ZIP_FILL = "zip-fill";
const ISO_LINE = "iso-line";

/** Id of the basemap's first label (symbol) layer. Custom layers are inserted
 * before it so basemap labels (city/road names) render on top of the choropleth. */
function firstSymbolLayerId(m: maplibregl.Map): string | undefined {
  for (const layer of m.getStyle().layers ?? []) {
    if (layer.type === "symbol") return layer.id;
  }
  return undefined;
}

/** Id of the basemap's (opaque) water fill layer. Inserting the choropleth
 * before it lets the basemap's accurate water mask the ZIP colors over water —
 * no geometry clipping needed. */
function waterLayerId(m: maplibregl.Map): string | undefined {
  for (const layer of m.getStyle().layers ?? []) {
    const srcLayer = (layer as { "source-layer"?: string })["source-layer"];
    if (layer.type === "fill" && (srcLayer === "water" || layer.id === "water")) return layer.id;
  }
  return undefined;
}

export default function MapView({
  geojson,
  isochrone,
  records,
  activeMetric,
  onViewportStops,
  budget,
  work,
  onWorkChange,
  recenterSignal,
  fitBbox,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const loaded = useRef(false);
  const marker = useRef<maplibregl.Marker | null>(null);
  const infoPopup = useRef<maplibregl.Popup | null>(null);

  // Keep the latest props in refs so the sync functions — which may be invoked
  // from the once-bound "load" handler with a stale closure — always read the
  // current data. Without this, a geojson that arrives before the basemap
  // finishes loading is dropped and the choropleth never renders.
  const onWorkChangeRef = useRef(onWorkChange);
  onWorkChangeRef.current = onWorkChange;
  const workRef = useRef(work);
  workRef.current = work;
  const geojsonRef = useRef(geojson);
  geojsonRef.current = geojson;
  const isochroneRef = useRef(isochrone);
  isochroneRef.current = isochrone;
  const budgetRef = useRef(budget);
  budgetRef.current = budget;
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const metricRef = useRef(activeMetric);
  metricRef.current = activeMetric;
  const onViewportStopsRef = useRef(onViewportStops);
  onViewportStopsRef.current = onViewportStops;
  const recomputeTimer = useRef<number | null>(null);

  // Recompute the choropleth ramp from the ZIPs currently in view (or all source
  // features before the first render), so a uniformly-priced area still spans the
  // full ramp. YoY keeps its fixed scale. Reports the stops up for the legend.
  function recomputeStops() {
    const m = map.current;
    if (!m || !loaded.current || !m.getLayer(ZIP_FILL)) return;
    const metric = metricRef.current;
    let stops = metric.fixedStops;
    if (!stops) {
      let feats = m.queryRenderedFeatures({ layers: [ZIP_FILL] }) as {
        properties?: Record<string, unknown> | null;
      }[];
      if (feats.length === 0) feats = (geojsonRef.current?.features ?? []) as typeof feats;
      stops = computeQuantileStops(metricValuesFromFeatures(feats, metric.property), metric.colors);
    }
    m.setPaintProperty(ZIP_FILL, "fill-color", fillColorExpression(metric.property, stops) as never);
    onViewportStopsRef.current(stops);
  }

  function scheduleRecompute() {
    if (recomputeTimer.current) window.clearTimeout(recomputeTimer.current);
    recomputeTimer.current = window.setTimeout(recomputeStops, 180);
  }

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: BASEMAP_STYLE_URL,
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // Draggable work-location pin; dragging or clicking the map moves it and
    // triggers an isochrone refetch upstream.
    const pin = new maplibregl.Marker({ color: WORK_MARKER_COLOR, draggable: true })
      .setLngLat([workRef.current.lon, workRef.current.lat])
      .setPopup(new maplibregl.Popup({ closeButton: false }).setText("Work location"))
      .addTo(m);
    pin.on("dragend", () => {
      const p = pin.getLngLat();
      onWorkChangeRef.current(p.lat, p.lng);
    });
    marker.current = pin;

    // Hover/tap a ZIP to show its median value. Layer-scoped handlers fire only
    // for the zip-fill layer and work even though it's added after this binding.
    const info = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    infoPopup.current = info;
    const showInfo = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      m.getCanvas().style.cursor = "pointer";
      const zip = ((f.properties ?? {}) as { zip?: string }).zip ?? "";
      info
        .setLngLat(e.lngLat)
        .setHTML(buildZipPopupHtml(zip, recordsRef.current.get(zip)))
        .addTo(m);
    };
    m.on("mousemove", ZIP_FILL, showInfo);
    m.on("click", ZIP_FILL, showInfo);
    m.on("mouseleave", ZIP_FILL, () => {
      m.getCanvas().style.cursor = "";
      info.remove();
    });

    // Pan/zoom re-spreads the ramp across what's now visible (debounced).
    m.on("moveend", scheduleRecompute);

    m.on("load", () => {
      loaded.current = true;
      syncZips();
      syncIsochrone();
    });
    map.current = m;
    return () => {
      if (recomputeTimer.current) window.clearTimeout(recomputeTimer.current);
      m.remove();
      map.current = null;
      marker.current = null;
      infoPopup.current = null;
      loaded.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Choropleth: add or update the source + fill/border layers.
  function syncZips() {
    const m = map.current;
    const data = geojsonRef.current;
    if (!m || !loaded.current || !data) return;
    const existing = m.getSource(ZIP_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data as never);
      m.once("idle", recomputeStops); // re-spread the ramp for the new data
      return;
    }
    m.addSource(ZIP_SOURCE, { type: "geojson", data: data as never });
    // Insert the choropleth beneath the basemap's opaque water layer, so water,
    // roads, and labels all render on top — the basemap's accurate water masks
    // the ZIP colors over Puget Sound / lakes without clipping the geometry.
    const anchor = waterLayerId(m) ?? firstSymbolLayerId(m);
    const metric = metricRef.current;
    const initialStops =
      metric.fixedStops ??
      computeQuantileStops(
        metricValuesFromFeatures(data.features as never[], metric.property),
        metric.colors,
      );
    m.addLayer(
      {
        id: ZIP_FILL,
        type: "fill",
        source: ZIP_SOURCE,
        paint: {
          "fill-color": fillColorExpression(metric.property, initialStops) as never,
          "fill-opacity": fillOpacityExpression(
            budgetRef.current,
            IN_BUDGET_OPACITY,
            OVER_BUDGET_OPACITY,
          ) as never,
        },
      },
      anchor,
    );
    onViewportStopsRef.current(initialStops);
    m.once("idle", recomputeStops); // refine to the viewport once rendered
    m.addLayer(
      {
        id: "zip-border",
        type: "line",
        source: ZIP_SOURCE,
        paint: { "line-color": "#ffffff", "line-width": 0.6, "line-opacity": 0.7 },
      },
      anchor,
    );
  }

  // Commute isochrone overlay (the work pin is managed separately).
  function syncIsochrone() {
    const m = map.current;
    const data = isochroneRef.current;
    if (!m || !loaded.current || !data) return;
    const existing = m.getSource(ISO_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data as never);
      return;
    }
    m.addSource(ISO_SOURCE, { type: "geojson", data: data as never });
    // Outline-only (no fill) per departure scenario, so the map below stays
    // readable; kept beneath the basemap labels.
    const lineColor: unknown[] = ["match", ["get", "scenario"]];
    for (const s of SCENARIO_STYLES) lineColor.push(s.key, s.line);
    lineColor.push("#888888"); // fallback (e.g. fixture's "typical")
    m.addLayer(
      {
        id: ISO_LINE,
        type: "line",
        source: ISO_SOURCE,
        paint: { "line-color": lineColor as never, "line-width": 2 },
      },
      firstSymbolLayerId(m),
    );
  }

  // Re-sync layers when data arrives.
  useEffect(syncZips, [geojson]);
  useEffect(syncIsochrone, [isochrone]);

  // Reflect external work-location changes (address / reset) on the pin.
  useEffect(() => {
    marker.current?.setLngLat([work.lon, work.lat]);
  }, [work.lat, work.lon]);

  // Fly to the work location when asked (address search / reset). Skips the
  // initial render (signal 0) so the map keeps its metro-wide opening view.
  useEffect(() => {
    const m = map.current;
    if (!m || recenterSignal === 0) return;
    m.flyTo({
      center: [workRef.current.lon, workRef.current.lat],
      zoom: Math.max(m.getZoom(), 11),
      duration: 800,
    });
  }, [recenterSignal]);

  // Budget changes only repaint opacity — no data mutation (R4).
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded.current || !m.getLayer(ZIP_FILL)) return;
    m.setPaintProperty(
      ZIP_FILL,
      "fill-opacity",
      fillOpacityExpression(budget, IN_BUDGET_OPACITY, OVER_BUDGET_OPACITY) as never,
    );
  }, [budget]);

  // Switching the active metric re-shades the choropleth from the current view.
  useEffect(() => {
    recomputeStops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMetric]);

  // Fit the map to the selected region's bounds (skip the initial mount so the
  // opening Seattle view is preserved).
  const firstFit = useRef(true);
  useEffect(() => {
    const m = map.current;
    if (!m || !fitBbox) return;
    if (firstFit.current) {
      firstFit.current = false;
      return;
    }
    m.fitBounds(fitBbox, { padding: 40, duration: 800 });
  }, [fitBbox]);

  return <div ref={container} style={{ position: "absolute", inset: 0 }} />;
}
