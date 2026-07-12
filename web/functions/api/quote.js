// Cloudflare Pages Function: ZenQuotes "quote of the day" proxy. ZenQuotes sends
// no CORS header, so the browser can't call it directly — we fetch it server-side
// and re-serve {q,a,date} with CORS. Cached for an hour (ZenQuotes updates at most
// hourly), which also keeps us well within their free rate limit. No key involved.
export async function onRequest(context) {
  const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
  try {
    const r = await fetch("https://zenquotes.io/api/today", {
      headers: { "user-agent": "PixelGate/1.0 (+https://pixelgate.pages.dev)" },
    });
    if (!r.ok) return new Response(JSON.stringify({ error: `zenquotes ${r.status}` }), { status: 502, headers: cors });
    const d = await r.json();
    const it = Array.isArray(d) ? d[0] : null;
    if (!it || !it.q) return new Response(JSON.stringify({ error: "empty response" }), { status: 502, headers: cors });
    return new Response(JSON.stringify({ q: it.q, a: it.a, date: it.date }), {
      headers: { ...cors, "cache-control": "public, max-age=3600" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: cors });
  }
}
