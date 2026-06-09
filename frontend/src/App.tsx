import { useCallback, useState } from "react";

import ControlsPanel from "./components/ControlsPanel";
import MapView from "./components/MapView";
import { DEFAULT_WORK, type WorkLocation } from "./config";
import { useMapData } from "./hooks/useMapData";

export default function App() {
  const [budget, setBudget] = useState(0);
  const [work, setWork] = useState<WorkLocation>(DEFAULT_WORK);
  // Bumped whenever the work point changes programmatically (address / reset) so
  // the map flies to it. Dragging the pin does NOT bump this — no jarring recenter.
  const [recenter, setRecenter] = useState(0);
  const { geojson, isochrone, loading, error } = useMapData(work);

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
        budget={budget}
        work={work}
        onWorkChange={handleWorkDrag}
        recenterSignal={recenter}
      />
      <ControlsPanel
        budget={budget}
        onBudgetChange={setBudget}
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
