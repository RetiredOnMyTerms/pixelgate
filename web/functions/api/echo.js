// Cloudflare Pages Function: echoes ?t=<text> as {"DispData": "<text>"}.
// The Times Gate polls this URL for SendHttpItemList type-23 (net-text) items,
// which is how we get arbitrary scrolling text onto the device without any
// stored state — the text rides in the query string.
export function onRequest(context) {
  const url = new URL(context.request.url);
  const t = url.searchParams.get("t") ?? "";
  return new Response(JSON.stringify({ DispData: t }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
