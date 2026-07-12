// Quote of the Day (ZenQuotes). ZenQuotes has no CORS header, so we go through our
// keyless proxy Function (which also caches hourly, respecting their rate limit).
// Quotes change once a day (00:00 UTC), so we only need to fetch once a day.
//
// Attribution: the ZenQuotes free tier REQUIRES crediting "Inspirational quotes
// provided by ZenQuotes API" linking to zenquotes.io. A pixel screen can't render a
// link, so we always include the attribution text in the scrolling display — it is
// not optional. (If a paid ZenQuotes key is added later, re-check their current
// terms before removing it.)

const QUOTE_PROXY = "https://pixelgate.pages.dev/api/quote";
export const ZEN_ATTRIBUTION = "Inspirational quotes provided by ZenQuotes API";

export type Quote = { text: string; author: string; date?: string };

export async function fetchQuote(): Promise<Quote | null> {
  const r = await fetch(QUOTE_PROXY);
  if (!r.ok) throw new Error(`Quote fetch failed (${r.status})`);
  const d = await r.json();
  if (d?.error || !d?.q) return null;
  return { text: String(d.q), author: String(d.a || "Unknown"), date: d.date };
}

/** The full rotation string: quote, then author, then the required attribution. */
export function quoteMarquee(q: Quote): string {
  return `“${q.text}”  — ${q.author}   ·   ${ZEN_ATTRIBUTION}`;
}

/** ~24h in ms — quotes only change at 00:00 UTC, so this is the refresh cadence. */
export const QUOTE_REFRESH_MS = 24 * 60 * 60 * 1000;
