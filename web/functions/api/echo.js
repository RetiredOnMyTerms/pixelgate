// Cloudflare Pages Function: net-text source for the Times Gate marquee.
// The device polls this for SendHttpItemList type-23 items.
//
// Device quirks handled here:
//  1. The parser needs the Divoom envelope (ReturnCode/ReturnMessage); a bare
//     {"DispData":...} shows "err at request!".
//  2. The URL fetcher errors on encoded spaces (%20) / special chars, so the
//     message arrives base64url-encoded in ?b= (pure [A-Za-z0-9-_]).
//  3. The device only scrolls on overflow, so short messages are repeated here
//     (server-side) — keeping the URL short while DispData is long.
// Legacy: ?t= is still accepted (plain text) for ad-hoc testing.
function fromB64url(b) {
  const pad = b.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(escape(atob(pad)));
  } catch {
    return "";
  }
}

export function onRequest(context) {
  const url = new URL(context.request.url);
  const b = url.searchParams.get("b");
  const t = b !== null ? fromB64url(b) : (url.searchParams.get("t") ?? "");
  let disp = t;
  if (t.trim()) {
    while (disp.length < 28) disp += "   -   " + t;
  }
  const body = { ReturnCode: 0, ReturnMessage: "", DispData: disp };
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
