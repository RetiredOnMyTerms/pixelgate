// Cloudflare Pages Function: ZenQuotes "quote of the day" proxy. ZenQuotes sends
// no CORS header, so the browser can't call it directly. It also rate-limits /
// intermittently blocks the shared Cloudflare egress IPs, so this is hardened:
//   - a realistic User-Agent (a custom one gets blocked)
//   - a couple of retries
//   - the last good quote is stored in the edge cache for a day and served as a
//     fallback whenever the upstream fetch fails, so one success covers the day
//     (quotes only change at 00:00 UTC anyway).
// No key involved.
const CACHE_KEY = "https://pixelgate.pages.dev/__quote_cache_v1";

async function fetchUpstream() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://zenquotes.io/api/today", {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          accept: "application/json,text/plain,*/*",
        },
        cf: { cacheTtl: 0 },
      });
      if (r.ok) {
        const d = await r.json();
        const it = Array.isArray(d) ? d[0] : null;
        if (it && it.q) return { q: it.q, a: it.a, date: it.date };
      }
    } catch {
      /* retry */
    }
  }
  return null;
}

export async function onRequest(context) {
  const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
  const cache = caches.default;
  const cacheReq = new Request(CACHE_KEY);

  const fresh = await fetchUpstream();
  if (fresh) {
    const res = new Response(JSON.stringify(fresh), {
      headers: { ...cors, "cache-control": "public, max-age=3600" },
    });
    // Persist the good copy for up to a day so failures can serve it stale.
    const stored = new Response(JSON.stringify(fresh), {
      headers: { ...cors, "cache-control": "public, max-age=86400" },
    });
    context.waitUntil(cache.put(cacheReq, stored));
    return res;
  }

  // Upstream failed — serve the last good quote if we have one.
  const cached = await cache.match(cacheReq);
  if (cached) {
    const body = await cached.text();
    return new Response(body, { headers: { ...cors, "x-quote-stale": "1", "cache-control": "public, max-age=1800" } });
  }

  return new Response(JSON.stringify({ error: "quote source temporarily unavailable" }), { status: 502, headers: cors });
}
