# Changelog

## 0.9.3 — 2026-07-12

- Flight tracker airport screens now show the universal departure (🛫) and
  arrival (🛬) plane pictograms above the airport code, instead of just the code.

## 0.9.2 — 2026-07-12

- Flight tracker respects AviationStack's free tier (100 requests/month):
  - **Local countdown** — the on-device "time left" re-renders every minute from
    cached data with NO API call; data is only re-fetched when stale.
  - **Adaptive data refresh** — ~30 min while active/near the flight, 1 h within
    3 h, 3 h far out; stops when landed.
  - **Monthly budget guard** — counts calls per month, shows "API N/100 left",
    and auto-stops at the cap.
  - **Manual default + dedupe** — auto-update off by default; repeat Track clicks
    within 5 min serve cached data. Flight lookup now costs one call (IATA vs ICAO
    chosen by code), and a landing is confirmed with a single call near arrival.

## 0.9.1 — 2026-07-12

- Fix flight tracker times. AviationStack tags times with a "+00:00" offset but
  the digits are the airport's LOCAL wall-clock time — the app was converting
  them again. Now shows the wall-clock time as-is (e.g. Dep 8:23p / Arr 12:06a)
  and computes the countdown by interpreting the digits in the airport timezone.

## 0.9.0 — 2026-07-11

- **Flight tracker widget**. Enter a flight number (and your own free AviationStack
  API key, stored only in your browser); the 5 screens show: airline logo,
  origin airport, departure/arrival times + time remaining, destination airport,
  flight code. Origin left, destination right.
- Countdown switches automatically: time-to-departure before the flight leaves,
  time-to-arrival once it's airborne. Poll rate adapts — slow far out, ~2 min
  near/during the flight (under the free 1-req/min limit).
- On landed / cancelled, the screens **revert to the previously-shown widget**.
- Airline logos via a keyless proxy Function (Kiwi source + CORS), then the same
  pixel-art pipeline as team logos.

## 0.8.1 — 2026-07-11

- Sharper team logos: higher pixel-art resolution (grid 44 → 80) and lighter
  colour quantization (5 → 8 levels), so crests keep detail instead of looking
  blocky.

## 0.8.0 — 2026-07-11

- **UI redesign with Radix Themes** — polished, accessible components (buttons,
  selects, switches, sliders, cards) in a dark cyan theme.
- Section 3 is now **"Display"**, with options grouped by category: Clock, Text,
  Graphics, Live sports (no longer a flat "templates" row).
- **On-page changelog** ("What's new") and FAQ, plus footer links to GitHub,
  Acknowledgements and Disclaimer.

## 0.7.3 — 2026-07-11

- On-page **FAQ** (collapsible) and a footer with GitHub / Acknowledgements /
  Disclaimer links.
- README: added a "Run it locally (development)" section (clone, bridge, web dev,
  exe build).

## 0.7.2 — 2026-07-11

- Fix scoreboard scores showing "[object Object]" for NBA/NHL — some sports
  return the score as an object ({displayValue,value}) rather than a string;
  coerce both.

## 0.7.1 — 2026-07-11

- Scoreboard logo tiles now carry the team abbreviation in a bottom label, so a
  pixelated crest is still identifiable at a glance.

## 0.7.0 — 2026-07-11

- **9 more leagues** in the Sports scoreboard: NBA, NHL, and soccer — MLS,
  Premier League, EFL Championship, Ligue 1, La Liga, Bundesliga, Serie A. The
  League dropdown is grouped (US / Soccer). Rosters are baked in from ESPN
  (`rosters.ts`, ~230 teams; regenerate on soccer promotion/relegation).
- Per-sport middle screen: quarter+clock (NBA), period+clock (NHL, OT/SO aware),
  match minute/HT (soccer), plus the existing NFL down&distance and MLB inning.
- **Soccer lists the home team first** (left); US leagues list the away team
  first — reflected in both the 5-screen layout and the matchup label.
- Logo resilience: `nextEvent` games expose `team.logos[]` (not `team.logo`);
  resolve both, and a missing/failed logo shows a blank tile instead of blanking
  the whole widget.

## 0.6.0 — 2026-07-11

- **MLB scoreboard** + generic multi-league core. The NFL widget was refactored
  into a league-agnostic `sports.ts` (ESPN client, game model, logo pixel-art,
  5-screen layout, polling); NFL and MLB are now thin configs (roster + how to
  render the live middle screen). Adding NBA/NHL later is trivial.
- The scoreboard template gains a **League** dropdown (NFL / MLB) beside the team
  picker. MLB middle screen shows inning half + number and outs/count while live;
  post-game shows scores + FINAL (verified against a real final game).
- Baseball live in-game fields are built to ESPN's shape and confirmed against
  pre/post now; the live inning/outs/count render verifies during a live game.

## 0.5.1 — 2026-07-11

- Fix preview layout: the wide NFL 5-screen strip no longer crushes the Send
  button/status into unreadable slivers — controls now wrap below the strip.

## 0.5.0 — 2026-07-11

- **NFL scoreboard widget** (first data-feed feature). Pick any of the 32 teams;
  the app pulls that team's current/next game from ESPN's free public API
  (client-side, CORS-open, no key) and drives all 5 screens: away logo, away
  score, quarter + down & distance, home score, home logo. Home/away placement
  follows the actual game, not the favourite team.
- Live game -> scores + "Q3" / "3rd & 7"; no game -> next fixture weekday / date /
  kickoff (local time) with both team logos; graceful "no data" fallback.
- **Logo -> pixel-art pipeline**: fetch team logo, downscale + quantize (bold,
  high-contrast) + nearest-neighbour upscale to 128, cached per logo.
- Auto-update polling: fast (~12s) while a game is live, slow (~7 min) when idle,
  detected from ESPN game state. All 5 screens pushed atomically (Draw/CommandList).
- 32-team roster is hardcoded (ESPN's /teams LIST endpoint fails browser CORS,
  while scoreboard, per-team, and logo endpoints work).

## 0.4.4 — 2026-07-11

- Newton's cradle "All screens": all 5 screens' frames are sent in one atomic
  `Draw/CommandList` so the per-screen loops start together and stay in phase
  (independent sends drifted out of sync).

## 0.4.3 — 2026-07-11

- Send button and confirmation say "all screens" when every screen is selected
  (instead of listing 1,2,3,4,5).

## 0.4.2 — 2026-07-11

- **Scrolling text fixed end-to-end.** The echo Function returns the Divoom
  net-text envelope (`ReturnCode`/`ReturnMessage`/`DispData`) — without it the
  device showed "err at request!". Short messages are repeated with a separator
  so the marquee always overflows and scrolls continuously.
- **Digital clock: stacked HH:MM + seconds** now renders immediately (forced
  NewFlag:0 repaint works around type 5 only repainting on minute change).
- **Newton's cradle** replaces the bouncing ball (five swinging spheres).
- Header links "Divoom Times Gate" to divoom.com/products/time-gate.
- Removed the analog clock (static snapshot the device can't animate cleanly).

## 0.4.1 — 2026-07-11

- **Scrolling text / marquee now works** — switched from the unreliable
  `Draw/SendHttpText` to on-device `SendHttpItemList` type 23 (net-text). A new
  Cloudflare Pages Function (`web/functions/api/echo.js`) echoes the message as
  `{"DispData": …}`; the device polls it and scrolls the text full-width when it
  overflows the screen. Self-updating, no re-push. Background is a preset.
- **Analog clock** clarified as a snapshot (the device can't render a live analog
  face): the second hand is hidden when static so it doesn't look frozen, with a
  hint to use Digital for a self-updating clock. Enable "live tick" to animate.

## 0.4.0 — 2026-07-11

- **On-device self-updating digital clock.** The Digital clock template now uses
  `Draw/SendHttpItemList` with a hosted solid background gif, so the time ticks
  natively on the device from a single send — no per-second re-push, no flicker,
  no UI lock. `HH:MM` with optional stacked seconds; tunable colour, size,
  background preset, and X/Y position (on-device `align`/centring is unreliable,
  so position is explicit).
- Solid background gifs are self-hosted (`web/public/bg/solid-*.gif`) with palette
  index 0 as an unused sentinel — works around the device treating palette index 0
  as transparent. Drops the external dummyimage.com dependency.
- **Verify connection** button — sends `Device/GetDeviceTime` and reports plainly
  whether the device answered and the LocalToken is valid.
- **Friendly messages** everywhere: raw `{"error_code":0}` etc. replaced with
  human sentences (success, token rejected, device unreachable, bridge not running…).
- **Live re-push no longer locks the app.** Off by default; when enabled for the
  analog clock it runs as a quiet background loop (no busy button, no reply spam)
  with a "live • last update" status. Digital clock no longer needs it.
- `Draw/SendHttpText` now sends both `LcdId` and `LcdIndex` (firmware is
  inconsistent about which names the target screen).

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
