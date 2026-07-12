// Cloudflare Pages Function: airline logo by IATA code, re-served with CORS so
// the browser canvas (pixel-art pipeline) can use it. Kiwi's CDN has the logos
// but sends no CORS header; we fetch it server-side (redirects followed) and add
// the header. No secret involved.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const iata = (url.searchParams.get("iata") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  const cors = { "access-control-allow-origin": "*" };
  if (!iata) return new Response("missing iata", { status: 400, headers: cors });
  try {
    const r = await fetch(`https://images.kiwi.com/airlines/128/${iata}.png`, { redirect: "follow" });
    const ct = r.headers.get("content-type") || "";
    if (r.ok && ct.startsWith("image")) {
      return new Response(r.body, {
        headers: { ...cors, "content-type": ct, "cache-control": "public, max-age=86400" },
      });
    }
  } catch {
    /* fall through */
  }
  return new Response("not found", { status: 404, headers: cors });
}
