# Changelog

## 0.3.0 — 2026-07-11

- In-app onboarding: a "Where do I find my LocalToken?" help panel in the Connect
  section showing three annotated Divoom-app screenshots (select device → open
  Settings → copy Local Token), served from `web/public/onboarding/`.
- The annotated screenshots redact the user's real Local Token, IP address, and
  Wi-Fi SSID. Raw source screenshots are gitignored and never committed.

## 0.2.0 — 2026-07-11

Turned the CLI into a product: hosted web app + local bridge (PixelGate).

- `bridge/` — local FastAPI bridge on `127.0.0.1` with CORS + Private-Network-Access
  headers so a hosted HTTPS app can reach the LAN device. Endpoints `/health`,
  `/post`, `/batch` (Draw/CommandList), `/discover`. Loopback-bound + private-IP
  SSRF guard; holds no secrets. Packaged as a single-file `pixelgate-bridge.exe`
  (PyInstaller) in addition to run-as-Python.
- `web/` — Vite + React + TypeScript SPA. TS device-command lib (`lib/timesgate.ts`),
  bridge client with script fallback (`lib/bridge.ts`), canvas renderers
  (`lib/render.ts`), localStorage config. Connect + auto-discover, 5-screen
  targeting, live 128×128 preview, send.
- Templates round 1: analog clock, digital clock (optional live re-push), text/marquee,
  bouncing ball, image upload (auto-downscale), solid colour.
- Verified end-to-end in a real browser: page → bridge → device (`error_code:0`,
  response read back through the bridge's CORS headers).
- Added `docs/DISCLAIMER.md`, `docs/ACKNOWLEDGEMENTS.md`, MIT `LICENSE`. Scrubbed
  device IP / LocalToken from all committed files (they live only in the browser
  and the local bridge).

## 0.1.0 — 2026-07-11

Initial working control of the Divoom Times Gate.

- Discovered device via Divoom cloud LAN API (`Device/ReturnSameLANDevice`) on the local LAN (Hardware 400).
- `timesgate.py`: `TimesGate` client — LocalToken auth, base64-JPEG frame encoding, monotonic PicID counter with `Draw/ResetHttpGifId`, `LcdArray`/`LcdIndex` screen addressing, timeout retry.
- `animations.py`: frame builders — bouncing ball, clock face, solid color, scrolling text — plus a CLI.
- Verified live: solid frame, bouncing-ball animation (screen 0), clock face (screen 1), scrolling text (screen 2). Independent per-screen addressing confirmed.
- Documented the firmware gotchas (LocalToken, JPEG PicData, PicID monotonicity, TextWidth<64) in `README.md`.
