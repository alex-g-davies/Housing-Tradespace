import { useCallback, useState } from "react";

import ControlsPanel from "./components/ControlsPanel";
import MapView from "./components/MapView";
import { DEFAULT_WORK, type WorkLocation } from "./config";
import { useMapData } from "./hooks/useMapData";

export default function App() {
  const [budget, setBudget] = useState(0);
  const [work, setWork] = useState<WorkLocation>(DEFAULT_WORK);
  const { geojson, isochrone, loading, error } = useMapData(work);

  const handleWorkChange = useCallback((lat: number, lon: number) => {
    setWork({ lat, lon });
  }, []);

  return (
    <div className="app">
      <MapView
        geojson={geojson}
        isochrone={isochrone}
        budget={budget}
        work={work}
        onWorkChange={handleWorkChange}
      />
      <ControlsPanel
        budget={budget}
        onBudgetChange={setBudget}
        work={work}
        onResetWork={() => setWork(DEFAULT_WORK)}
        metroLabel="Seattle–Tacoma–Bellevue, WA"
      />
      {loading && <div className="status">Loading map…</div>}
      {error && <div className="status status--error">Couldn’t load map data: {error}</div>}
    </div>
  );
}
