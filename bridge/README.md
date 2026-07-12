# PixelGate bridge

Tiny local helper that lets the hosted PixelGate web app control your Divoom
Times Gate. It runs on your own machine at `http://127.0.0.1:7660` and forwards
commands to the device on your LAN.

**Why it's needed:** a website served over HTTPS can't talk to the device
directly — the device is HTTP-only on a private IP and sends no CORS headers, so
the browser can never read its replies. This bridge sits in between: the browser
can safely call `127.0.0.1`, and the bridge relays to the device.

## Run it (Python)

```bash
pip install -r requirements.txt
python app.py
```

Leave it running while you use the web app. Stop with Ctrl+C.

- Port: set `PIXELGATE_PORT` (default `7660`).
- Allowed web origins: `PIXELGATE_ALLOWED_ORIGINS` (regex). Defaults to
  `*.pages.dev` + `localhost`. Set this to your custom domain if you use one.

## Run it (no Python — packaged exe)

```bash
pip install pyinstaller
pyinstaller pixelgate-bridge.spec
```

Produces `dist/pixelgate-bridge.exe`. Double-click it (a console window shows the
server is up), then use the web app. Nothing is installed system-wide.

## Endpoints

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/health` | — | Liveness + version (the web app polls this to detect the bridge) |
| POST | `/post` | `{"target":"<device-ip>","payload":{…device Command…}}` | Forward one command, relay device JSON |
| POST | `/batch` | `{"target":"<ip>","payload":{"LocalToken":<int>,"CommandList":[…]}}` | `Draw/CommandList` — flicker-free multi-screen |
| GET | `/discover` | — | Divoom cloud lookup of devices on your LAN |

## Safety

- Binds **loopback only** (`127.0.0.1`) — not reachable from your network.
- Forwards **only to private/LAN IPs** (SSRF guard); public targets are rejected.
- Holds **no secrets** — your LocalToken is sent by the web app inside the
  payload and never leaves your machine.
