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
  /** Resolved per-state ramp breaks, shared with the legend (stable — no
   * viewport re-spreading). */
  stops: ColorStop[];
  budget: number;
  work: WorkLocation;
  onWorkChange: (lat: number, lon: number) => void;
  /** Increment to fly the map to the current work location (address / reset). */
  recenterSignal: number;
  /** Region bounds to fit when the selected state changes (national). */
  fitBbox: [number, number, number, number] | null;
  /** Whether the FIRST fitBbox should fly (URL deep link to a state). Without
   * it the opening metro view is preserved, as before. */
  fitInitialBounds: boolean;
  /** ZIP selection (009 R1): clicking a ZIP selects it; outlines track these. */
  selectedZip: string | null;
  pinnedZip: string | null;
  onSelectZip: (zip: string) => void;
  /** Fly target for top movers / URL deep links (009 R5/R6): bump the signal
   * to fly to the point — same counter pattern as recenterSignal. */
  focusPoint: [number, number] | null;
  focusSignal: number;
}

const ZIP_SOURCE = "zips";
const ISO_SOURCE = "isochrone";
const ZIP_FILL = "zip-fill";
const ISO_LINE = "iso-line";
const ZIP_SELECTED = "zip-selected";
const ZIP_PINNED = "zip-pinned";

/** Filter matching exactly one ZIP (or nothing, for null). */
function zipFilter(zip: string | null): maplibregl.FilterSpecification {
  return ["==", ["get", "zip"], zip ?? ""] as unknown as maplibregl.FilterSpecification;
}

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
  stops,
  budget,
  work,
  onWorkChange,
  recenterSignal,
  fitBbox,
  fitInitialBounds,
  selectedZip,
  pinnedZip,
  onSelectZip,
  focusPoint,
  focusSignal,
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
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const onSelectZipRef = useRef(onSelectZip);
  onSelectZipRef.current = onSelectZip;
  const selectedZipRef = useRef(selectedZip);
  selectedZipRef.current = selectedZip;
  const pinnedZipRef = useRef(pinnedZip);
  pinnedZipRef.current = pinnedZip;

  // Repaint the choropleth from the current metric + per-state stops.
  function applyFill() {
    const m = map.current;
    if (!m || !loaded.current || !m.getLayer(ZIP_FILL)) return;
    m.setPaintProperty(
      ZIP_FILL,
      "fill-color",
      fillColorExpression(metricRef.current.property, stopsRef.current) as never,
    );
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

    // Draggable work-location pin — the brand shield in a circular badge, so
    // the marker reads as part of the product, not a stock teardrop.
    const pinEl = document.createElement("img");
    pinEl.src = "/brand/mark-512.png";
    pinEl.alt = "Work location";
    pinEl.className = "work-pin";
    const pin = new maplibregl.Marker({ element: pinEl, draggable: true, anchor: "center" })
      .setLngLat([workRef.current.lon, workRef.current.lat])
      .setPopup(new maplibregl.Popup({ closeButton: false, offset: 22 }).setText("Work location"))
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
    // Click = select (009 R1): opens the detail panel; the hover tooltip is
    // dismissed so it doesn't sit on top of the outline.
    m.on("click", ZIP_FILL, (e) => {
      const zip = ((e.features?.[0]?.properties ?? {}) as { zip?: string }).zip;
      if (!zip) return;
      info.remove();
      onSelectZipRef.current(zip);
    });
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
      applyFill(); // new state's data -> repaint with its per-state stops
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
            stopsRef.current,
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
    // Selection outlines (009 R1/R7): filter-based so they survive setData and
    // need no feature-state bookkeeping. Above the basemap labels' anchor so
    // the highlight is never buried.
    m.addLayer({
      id: ZIP_SELECTED,
      type: "line",
      source: ZIP_SOURCE,
      filter: zipFilter(selectedZipRef.current),
      paint: { "line-color": "#e64a19", "line-width": 2.5 },
    });
    m.addLayer({
      id: ZIP_PINNED,
      type: "line",
      source: ZIP_SOURCE,
      filter: zipFilter(pinnedZipRef.current),
      paint: { "line-color": "#1a2230", "line-width": 2, "line-dasharray": [2, 2] },
    });
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

  // Track selection/pin changes on the outline layers.
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded.current || !m.getLayer(ZIP_SELECTED)) return;
    m.setFilter(ZIP_SELECTED, zipFilter(selectedZip));
    m.setFilter(ZIP_PINNED, zipFilter(pinnedZip));
  }, [selectedZip, pinnedZip]);

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

  // Metric or per-state stops changed -> repaint the choropleth.
  useEffect(() => {
    applyFill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMetric, stops]);

  // Fit the map to the selected region's bounds. The first fit is skipped to
  // preserve the opening metro view — unless a URL deep link asked for it.
  const firstFit = useRef(true);
  useEffect(() => {
    const m = map.current;
    if (!m || !fitBbox) return;
    if (firstFit.current) {
      firstFit.current = false;
      if (!fitInitialBounds) return;
    }
    m.fitBounds(fitBbox, { padding: 40, duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitBbox]);

  // Fly to a focus point (top mover click / URL deep-linked ZIP).
  useEffect(() => {
    const m = map.current;
    if (!m || focusSignal === 0 || !focusPoint) return;
    m.flyTo({ center: focusPoint, zoom: Math.max(m.getZoom(), 10.5), duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);

  return <div ref={container} style={{ position: "absolute", inset: 0 }} />;
}
