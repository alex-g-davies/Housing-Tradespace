import { useEffect, useState } from "react";

import { type WikiSummary, fetchWikiSummary, wikiTitleCandidates } from "../lib/wiki";

/** Wikipedia summary for the selected place (012 R3). Best-effort: null while
 * loading and on any miss/failure — the panel simply omits the section. */
export function useWikiSummary(
  place: string | null,
  stateName: string | null,
): WikiSummary | null {
  const [summary, setSummary] = useState<WikiSummary | null>(null);

  useEffect(() => {
    setSummary(null);
    if (!place) return;
    const controller = new AbortController();
    fetchWikiSummary(wikiTitleCandidates(place, stateName), controller.signal)
      .then((s) => {
        if (!controller.signal.aborted) setSummary(s);
      })
      .catch(() => {
        /* aborted or network failure -> no section */
      });
    return () => controller.abort();
  }, [place, stateName]);

  return summary;
}
