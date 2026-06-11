import { useState } from "react";

const STORAGE_KEY = "tradespace.hint-dismissed";

function alreadyDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true; // storage blocked -> never nag
  }
}

/** One-line first-run hint (005 R6); dismissal is remembered in localStorage. */
export default function Onboarding() {
  const [visible, setVisible] = useState(() => !alreadyDismissed());
  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* storage blocked -> dismiss for this session only */
    }
  };

  return (
    <div className="hint" role="note">
      <span>
        Drag the <strong>pin</strong> to your work location and set a{" "}
        <strong>budget</strong> — the map shows what's affordable within reach.
      </span>
      <button type="button" className="hint__dismiss" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
