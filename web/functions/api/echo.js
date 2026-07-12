// Cloudflare Pages Function: echoes ?t=<text> as a Divoom-shaped net-text reply.
// The Times Gate polls this URL for SendHttpItemList type-23 (net-text) items.
// The device's net-text parser expects the same envelope Divoom's own endpoints
// return (ReturnCode/ReturnMessage present) — a bare {"DispData":...} makes the
// panel show "err at request!". So we mirror that envelope exactly.
export function onRequest(context) {
  const url = new URL(context.request.url);
  const t = url.searchParams.get("t") ?? "";
  const body = { ReturnCode: 0, ReturnMessage: "", DispData: t };
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
