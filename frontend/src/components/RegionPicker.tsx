import type { RegionInfo } from "../api/client";

interface Props {
  regions: RegionInfo[];
  state: string;
  onStateChange: (code: string) => void;
}

/** State selector for the cost layer (national region-on-demand). */
export default function RegionPicker({ regions, state, onStateChange }: Props) {
  return (
    <label className="region">
      <span className="section-label">State</span>
      <select
        className="region__select"
        aria-label="State"
        value={state}
        onChange={(e) => onStateChange(e.target.value)}
      >
        {regions.map((r) => (
          <option key={r.code} value={r.code}>
            {r.name} ({r.zip_count})
          </option>
        ))}
      </select>
    </label>
  );
}
