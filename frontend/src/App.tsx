import { useState } from "react";

import ControlsPanel from "./components/ControlsPanel";
import MapView from "./components/MapView";
import { useMapData } from "./hooks/useMapData";

export default function App() {
  const [budget, setBudget] = useState(0);
  const { geojson, isochrone, loading, error } = useMapData();

  return (
    <div className="app">
      <MapView geojson={geojson} isochrone={isochrone} budget={budget} />
      <ControlsPanel
        budget={budget}
        onBudgetChange={setBudget}
        metroLabel="Seattle–Tacoma–Bellevue, WA"
      />
      {loading && <div className="status">Loading map…</div>}
      {error && <div className="status status--error">Couldn’t load map data: {error}</div>}
    </div>
  );
}
