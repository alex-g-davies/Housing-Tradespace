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

interface Props {
  geojson: FeatureCollection | null;
  isochrone: FeatureCollection | null;
  budget: number;
  work: WorkLocation;
  onWorkChange: (lat: number, lon: number) => void;
}

const ZIP_SOURCE = "zips";
const ISO_SOURCE = "isochrone";

export default function MapView({ geojson, isochrone, budget, work, onWorkChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const loaded = useRef(false);
  const marker = useRef<maplibregl.Marker | null>(null);

  // Keep the latest callback + work in refs so the map handlers (bound once on
  // load) never call a stale closure.
  const onWorkChangeRef = useRef(onWorkChange);
  onWorkChangeRef.current = onWorkChange;
  const workRef = useRef(work);
  workRef.current = work;

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

    m.on("click", (e) => onWorkChangeRef.current(e.lngLat.lat, e.lngLat.lng));
    m.getCanvas().style.cursor = "crosshair";

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
      loaded.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Choropleth: add or update the source + fill/border layers.
  function syncZips() {
    const m = map.current;
    if (!m || !loaded.current || !geojson) return;
    const existing = m.getSource(ZIP_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(geojson as never);
      return;
    }
    m.addSource(ZIP_SOURCE, { type: "geojson", data: geojson as never });
    m.addLayer({
      id: "zip-fill",
      type: "fill",
      source: ZIP_SOURCE,
      paint: {
        "fill-color": fillColorExpression() as never,
        "fill-opacity": fillOpacityExpression(
          budget,
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
    if (!m || !loaded.current || !isochrone) return;
    const existing = m.getSource(ISO_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(isochrone as never);
      return;
    }
    m.addSource(ISO_SOURCE, { type: "geojson", data: isochrone as never });
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

  // Reflect external work-location changes (e.g. the reset button) on the pin.
  useEffect(() => {
    marker.current?.setLngLat([work.lon, work.lat]);
  }, [work.lat, work.lon]);

  // Budget changes only repaint opacity — no data mutation (R4).
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded.current || !m.getLayer("zip-fill")) return;
    m.setPaintProperty(
      "zip-fill",
      "fill-opacity",
      fillOpacityExpression(budget, IN_BUDGET_OPACITY, OVER_BUDGET_OPACITY) as never,
    );
  }, [budget]);

  return <div ref={container} style={{ position: "absolute", inset: 0 }} />;
}
