import type { CommuteVariation } from "../api/client";
import { COMMUTE_STEPS, SCENARIO_STYLES } from "../config";
import { formatSqMi } from "../lib/format";

interface Props {
  minutes: number;
  onMinutesChange: (minutes: number) => void;
  variation: CommuteVariation | null;
}

/** Commute-time selector (15/30/45/60) + the time-of-day reach-variation summary. */
export default function CommuteControl({ minutes, onMinutesChange, variation }: Props) {
  return (
    <div className="commute">
      <span className="section-label">Commute time</span>
      <div className="switcher" role="group" aria-label="Commute time (minutes)">
        {COMMUTE_STEPS.map((m) => (
          <button
            key={m}
            type="button"
            className={m === minutes ? "switcher__btn switcher__btn--active" : "switcher__btn"}
            aria-pressed={m === minutes}
            onClick={() => onMinutesChange(m)}
          >
            {m} min
          </button>
        ))}
      </div>

      {/* Scenario detail folds away (010 R4) — the colored outlines on the
          map carry the message; the breakdown is for the curious. */}
      <details className="panel-fold">
        <summary>Traffic scenarios</summary>
        <ul className="scenarios">
          {SCENARIO_STYLES.map((s) => (
            <li key={s.key} className="scenarios__row">
              <span className="scenarios__line" style={{ background: s.line }} />
              {s.label}
              {variation && (
                <span className="scenarios__area">
                  {formatSqMi(variation[`${s.key}_sqmi` as const])}
                </span>
              )}
            </li>
          ))}
        </ul>
        {variation?.peak_shrink_pct != null ? (
          <p className="commute__summary">
            Evening rush shrinks your {minutes}-min reach{" "}
            <strong>{variation.peak_shrink_pct}%</strong> vs. light traffic.
          </p>
        ) : (
          <p className="commute__summary commute__summary--muted">
            Traffic variation unavailable (showing a typical contour).
          </p>
        )}
        <p className="commute__note">Drive time leaving your workplace.</p>
      </details>
    </div>
  );
}
