// Wikipedia place summaries (spec 012 R3) — client-direct: the REST summary
// endpoint is keyless with CORS *, so proxying it would add backend surface
// for zero security gain. CC BY-SA attribution is mandatory wherever shown.

export interface WikiSummary {
  extract: string;
  thumbnailUrl: string | null;
  pageUrl: string;
}

const SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/";

// Memo (including misses) so re-selecting places never refetches in-session;
// the browser HTTP cache covers cross-session repeats.
const memo = new Map<string, WikiSummary | null>();

/** Title candidates, most specific first: "Gig Harbor, Washington" usually
 * exists for US places; the bare name is the fallback. */
export function wikiTitleCandidates(place: string, stateName: string | null): string[] {
  const out: string[] = [];
  if (stateName) out.push(`${place}, ${stateName}`);
  out.push(place);
  return out;
}

interface SummaryResponse {
  type?: string;
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

async function fetchTitle(title: string, signal?: AbortSignal): Promise<WikiSummary | null> {
  if (memo.has(title)) return memo.get(title) ?? null;
  let result: WikiSummary | null = null;
  try {
    const res = await fetch(SUMMARY_URL + encodeURIComponent(title), {
      signal,
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const body = (await res.json()) as SummaryResponse;
      // Only real articles: disambiguation/redirect-ish pages are useless here.
      if (body.type === "standard" && body.extract && body.content_urls?.desktop?.page) {
        result = {
          extract: body.extract,
          thumbnailUrl: body.thumbnail?.source ?? null,
          pageUrl: body.content_urls.desktop.page,
        };
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err; // don't memoize aborts
    result = null;
  }
  memo.set(title, result);
  return result;
}

/** First usable summary among the candidates, else null. */
export async function fetchWikiSummary(
  candidates: string[],
  signal?: AbortSignal,
): Promise<WikiSummary | null> {
  for (const title of candidates) {
    const summary = await fetchTitle(title, signal);
    if (summary) return summary;
  }
  return null;
}

/** Test hook. */
export function clearWikiMemo(): void {
  memo.clear();
}
