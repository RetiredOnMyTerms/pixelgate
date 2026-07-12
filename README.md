# PixelGate — unofficial Divoom Times Gate control

Design and push custom pixel visuals, animations, clocks, and live data to a
**Divoom Times Gate** (5× 128×128 LCD screens) from a web app.

> **UNOFFICIAL.** Not affiliated with, endorsed by, or supported by Divoom.
> "Divoom" and "Times Gate" are trademarks of their owner. Uses an undocumented
> local device API that may change or break. **Use at your own risk** — see
> [`docs/DISCLAIMER.md`](docs/DISCLAIMER.md).

**Version:** 0.3.0 · [Changelog](CHANGELOG.md) · [Acknowledgements](docs/ACKNOWLEDGEMENTS.md)

## Why a bridge?

A hosted HTTPS web app can't talk to the device directly: the Times Gate is
HTTP-only on a private LAN IP and sends no CORS headers, so the browser can never
read its replies. PixelGate ships a tiny **local bridge** that runs on your
machine (`127.0.0.1`), which the web app calls and which relays to the device.

```
Cloudflare Pages (web app)  ──▶  local bridge 127.0.0.1  ──▶  Times Gate (LAN)
```

## Components

| Path | What |
|---|---|
| `web/` | The web app (Vite + React + TypeScript). Deploys to Cloudflare Pages. |
| `bridge/` | Local bridge (FastAPI). Run as Python or as a packaged `.exe`. |
| `timesgate.py` | Python device client (used by the bridge and the CLI). |
| `animations.py` | Standalone CLI toolkit (no web app needed). |
| `functions/` | Cloudflare Pages Functions (data-feed proxies, device-pull endpoints). |

## Quick start

1. **Get your LocalToken** — an integer shown in the Divoom phone app (device
   settings). Every command needs it; without it the device returns
   `{"error_code":"DeviceToken is err"}`.
2. **Run the bridge** (`bridge/README.md`): `pip install -r bridge/requirements.txt`
   then `python bridge/app.py`. Leave it running.
3. **Open the web app** (hosted, or `cd web && npm install && npm run dev`).
   Click **Discover device**, paste your LocalToken, pick a template, **Send**.

Your device IP and LocalToken live only in your browser (localStorage) and the
local bridge — they are never sent to any cloud host.

## CLI (no web app)

```bash
py -m venv .venv
./.venv/Scripts/python.exe -m pip install pillow requests
# usage: python animations.py <DEVICE_IP> <LOCAL_TOKEN> <screen 0-4> <effect> [args]
./.venv/Scripts/python.exe animations.py <DEVICE_IP> <LOCAL_TOKEN> 0 ball
./.venv/Scripts/python.exe animations.py <DEVICE_IP> <LOCAL_TOKEN> 2 text "HELLO" "#00E5FF"
```

## Find your device IP

```bash
python -c "import urllib.request;print(urllib.request.urlopen('https://app.divoom-gz.com/Device/ReturnSameLANDevice',data=b'{}').read().decode())"
```
(Run on a machine on the same LAN; matches devices on your current public IP.)
The web app's **Discover device** button does this for you via the bridge.

## Firmware gotchas

- `LocalToken` (int, from app) required on **every** request.
- `Draw/SendHttpGif` `PicData` = base64 **JPEG**, not raw RGB (raw → stuck "loading").
- `PicID` = small strictly-increasing counter (reset via `Draw/ResetHttpGifId`).
- Drawing selects screens with `LcdArray[5]`; text/items use `LcdIndex`.
- `SendHttpText` `TextWidth` must be `>16 and <64`.

Primary API reference: [averhaegen/hacs-divoom-times-gate-dev](https://github.com/averhaegen/hacs-divoom-times-gate-dev).
Full credits in [`docs/ACKNOWLEDGEMENTS.md`](docs/ACKNOWLEDGEMENTS.md).
