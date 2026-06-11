import { useState } from "react";

interface Props {
  messages: string[];
}

/** Non-blocking, dismissible degradation notices (005 R2). A dismissed
 * message stays hidden for the session; a recovered source simply stops
 * sending it. */
export default function Toasts({ messages }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = messages.filter((m) => !dismissed.has(m));
  if (visible.length === 0) return null;

  return (
    <div className="toasts">
      {visible.map((m) => (
        <div key={m} className="status status--warn" role="status">
          <span>{m}</span>
          <button
            type="button"
            className="status__dismiss"
            aria-label="Dismiss"
            onClick={() => setDismissed((prev) => new Set(prev).add(m))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
