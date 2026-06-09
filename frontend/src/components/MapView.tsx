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
  WORK_MARKER_COLOR,
  type WorkLocation,
} from "../config";
import type { ZipValue } from "../api/client";
import { fillColorExpression, fillOpacityExpression } from "../lib/colorScale";
import { buildZipPopupHtml } from "../lib/popup";

interface Props {
  geojson: FeatureCollection | null;
  isochrone: FeatureCollection | null;
  records: Map<string, ZipValue>;
  activeMetric: MetricDef;
  budget: number;
  work: WorkLocation;
  onWorkChange: (lat: number, lon: number) => void;
  /** Increment to fly the map to the current work location (address / reset). */
  recenterSignal: number;
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
  budget,
  work,
  onWorkChange,
  recenterSignal,
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

    m.on("load", () => {
      loaded.current = true;
      syncZips();
      syncIsochrone();
    });
    map.current = m;
    return () => {
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
      return;
    }
    m.addSource(ZIP_SOURCE, { type: "geojson", data: data as never });
    // Insert the choropleth beneath the basemap's opaque water layer, so water,
    // roads, and labels all render on top — the basemap's accurate water masks
    // the ZIP colors over Puget Sound / lakes without clipping the geometry.
    const anchor = waterLayerId(m) ?? firstSymbolLayerId(m);
    m.addLayer(
      {
        id: ZIP_FILL,
        type: "fill",
        source: ZIP_SOURCE,
        paint: {
          "fill-color": fillColorExpression(
            metricRef.current.property,
            metricRef.current.stops,
          ) as never,
          "fill-opacity": fillOpacityExpression(
            budgetRef.current,
            IN_BUDGET_OPACITY,
            OVER_BUDGET_OPACITY,
          ) as never,
        },
      },
      anchor,
    );
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

  // Switching the active metric re-shades the choropleth (paint change only).
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded.current || !m.getLayer(ZIP_FILL)) return;
    m.setPaintProperty(
      ZIP_FILL,
      "fill-color",
      fillColorExpression(activeMetric.property, activeMetric.stops) as never,
    );
  }, [activeMetric]);

  return <div ref={container} style={{ position: "absolute", inset: 0 }} />;
}
