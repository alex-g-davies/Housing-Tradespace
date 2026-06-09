import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";

import {
  BASEMAP_STYLE_URL,
  IN_BUDGET_OPACITY,
  ISOCHRONE_FILL,
  ISOCHRONE_LINE,
  MAP_CENTER,
  MAP_ZOOM,
  OVER_BUDGET_OPACITY,
  type WorkLocation,
} from "../config";
import { fillColorExpression, fillOpacityExpression } from "../lib/colorScale";
import { formatUsd } from "../lib/format";

interface Props {
  geojson: FeatureCollection | null;
  isochrone: FeatureCollection | null;
  budget: number;
  work: WorkLocation;
  onWorkChange: (lat: number, lon: number) => void;
  /** Increment to fly the map to the current work location (address / reset). */
  recenterSignal: number;
}

const ZIP_SOURCE = "zips";
const ISO_SOURCE = "isochrone";
const ZIP_FILL = "zip-fill";

export default function MapView({
  geojson,
  isochrone,
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
    const pin = new maplibregl.Marker({ color: ISOCHRONE_LINE, draggable: true })
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
      const props = (f.properties ?? {}) as { zip?: string; median_value?: number };
      const value =
        props.median_value != null ? formatUsd(props.median_value) : "No price data";
      info
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="tip"><div class="tip__zip">ZIP ${props.zip ?? "—"}</div>` +
            `<div class="tip__val">${value}</div></div>`,
        )
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
    m.addLayer({
      id: ZIP_FILL,
      type: "fill",
      source: ZIP_SOURCE,
      paint: {
        "fill-color": fillColorExpression() as never,
        "fill-opacity": fillOpacityExpression(
          budgetRef.current,
          IN_BUDGET_OPACITY,
          OVER_BUDGET_OPACITY,
        ) as never,
      },
    });
    m.addLayer({
      id: "zip-border",
      type: "line",
      source: ZIP_SOURCE,
      paint: { "line-color": "#ffffff", "line-width": 0.6, "line-opacity": 0.7 },
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
    m.addLayer({
      id: "iso-fill",
      type: "fill",
      source: ISO_SOURCE,
      paint: { "fill-color": ISOCHRONE_FILL, "fill-opacity": 0.18 },
    });
    m.addLayer({
      id: "iso-line",
      type: "line",
      source: ISO_SOURCE,
      paint: { "line-color": ISOCHRONE_LINE, "line-width": 2 },
    });
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

  return <div ref={container} style={{ position: "absolute", inset: 0 }} />;
}
