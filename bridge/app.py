"""PixelGate local bridge.

A tiny loopback HTTP server that lets a hosted HTTPS SPA control a Divoom Times
Gate on the LAN. It exists because the browser can't reach the device directly:
the device is HTTP-only on a private IP and sends no CORS headers, so its
responses are unreadable from a page. This bridge runs on 127.0.0.1 (exempt from
mixed-content blocking), adds the CORS + Private-Network-Access headers the
device lacks, and forwards commands to the device server-side.

Run:  python -m uvicorn app:app --host 127.0.0.1 --port 7660
      (or just `python app.py`)

Security: binds loopback only; forwards ONLY to private/loopback IPs (SSRF guard);
holds no secrets — the SPA sends the full device payload (LocalToken included),
which never leaves the local machine.
"""

import ipaddress
import os

import requests
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

VERSION = "0.7.1"
DEVICE_TIMEOUT = 8
CLOUD_DISCOVER = "https://app.divoom-gz.com/Device/ReturnSameLANDevice"

# Which web origins may call the bridge. Cloudflare Pages (*.pages.dev) + any
# custom domain via env, plus localhost for SPA dev. Regex keeps preview URLs working.
ALLOWED_ORIGIN_REGEX = os.environ.get(
    "PIXELGATE_ALLOWED_ORIGINS",
    r"^https://([a-z0-9-]+\.)*pages\.dev$|^http://localhost(:\d+)?$|^http://127\.0\.0\.1(:\d+)?$",
)

app = FastAPI(title="PixelGate bridge", version=VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    max_age=600,
)


@app.middleware("http")
async def private_network_access(request: Request, call_next):
    """Answer the Private Network Access preflight that older Chrome sends when a
    public HTTPS site calls a loopback server. CORSMiddleware doesn't do this."""
    if request.method == "OPTIONS" and request.headers.get(
        "access-control-request-private-network"
    ):
        resp = Response(status_code=204)
        origin = request.headers.get("origin", "")
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Private-Network"] = "true"
        resp.headers["Access-Control-Max-Age"] = "600"
        return resp
    return await call_next(request)


def _is_lan(host: str) -> bool:
    """True only for private/loopback IPv4/IPv6 — blocks SSRF to public hosts."""
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback


class PostBody(BaseModel):
    target: str                 # device IP, e.g. "192.168.1.50"
    payload: dict               # full device command incl. Command + LocalToken


@app.get("/health")
def health():
    return {"ok": True, "service": "pixelgate-bridge", "version": VERSION}


@app.post("/post")
def post(body: PostBody):
    """Forward one command to http://<target>/post and relay the device's JSON."""
    if not _is_lan(body.target):
        return JSONResponse(
            {"error": "target must be a private/LAN IP address"}, status_code=400
        )
    try:
        r = requests.post(
            f"http://{body.target}/post", json=body.payload, timeout=DEVICE_TIMEOUT
        )
        try:
            return r.json()
        except ValueError:
            return {"raw": r.text}
    except requests.RequestException as e:
        return JSONResponse({"error": f"device unreachable: {e}"}, status_code=502)


@app.post("/batch")
def batch(body: PostBody):
    """Wrap a list of commands in Draw/CommandList for flicker-free multi-screen
    updates. body.payload = {"LocalToken": <int>, "CommandList": [ {...}, ... ]}."""
    if not _is_lan(body.target):
        return JSONResponse(
            {"error": "target must be a private/LAN IP address"}, status_code=400
        )
    command = {"Command": "Draw/CommandList", **body.payload}
    try:
        r = requests.post(
            f"http://{body.target}/post", json=command, timeout=DEVICE_TIMEOUT
        )
        try:
            return r.json()
        except ValueError:
            return {"raw": r.text}
    except requests.RequestException as e:
        return JSONResponse({"error": f"device unreachable: {e}"}, status_code=502)


@app.get("/discover")
def discover():
    """Ask the Divoom cloud which devices share this LAN's public IP."""
    try:
        r = requests.post(CLOUD_DISCOVER, data=b"{}", timeout=DEVICE_TIMEOUT)
        return r.json()
    except requests.RequestException as e:
        return JSONResponse({"error": f"cloud unreachable: {e}"}, status_code=502)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PIXELGATE_PORT", "7660"))
    uvicorn.run(app, host="127.0.0.1", port=port)
