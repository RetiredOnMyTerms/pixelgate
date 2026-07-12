// Talks to the local PixelGate bridge (127.0.0.1). Detects it, pushes commands,
// and — when it's not running — generates a copy-paste script the user can run.

import type { Command } from "./timesgate";

export type BridgeStatus =
  | { ok: true; version: string }
  | { ok: false; error: string };

export function bridgeBase(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export async function detectBridge(port: number): Promise<BridgeStatus> {
  try {
    const r = await fetch(`${bridgeBase(port)}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, version: j.version ?? "?" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type DeviceReply = { error_code?: number | string; [k: string]: unknown };

/** Send one command through the bridge to the device. */
export async function pushCommand(
  port: number,
  target: string,
  payload: Command,
): Promise<DeviceReply> {
  const r = await fetch(`${bridgeBase(port)}/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, payload }),
  });
  return r.json();
}

/** Send a sequence of commands in order (e.g. animation frames). Returns last reply. */
export async function pushSequence(
  port: number,
  target: string,
  payloads: Command[],
): Promise<DeviceReply> {
  let last: DeviceReply = {};
  for (const p of payloads) last = await pushCommand(port, target, p);
  return last;
}

export type Friendly = { ok: boolean; msg: string };

/** Turn a raw device/bridge reply into a human sentence. */
export function friendly(reply: DeviceReply | string, okMsg: string): Friendly {
  if (typeof reply === "string") return { ok: false, msg: humanize(reply) };
  if (reply.error) return { ok: false, msg: humanize(String(reply.error)) };
  const ec = reply.error_code;
  if (ec === 0 || ec === "0" || ec === undefined) return { ok: true, msg: okMsg };
  return { ok: false, msg: humanize(String(ec)) };
}

function humanize(e: string): string {
  if (/DeviceToken/i.test(e))
    return "LocalToken not accepted — re-check the number in the Divoom app (device → Settings → Local Token).";
  if (/illegal json|data illegal/i.test(e))
    return "The device rejected the request (unsupported parameters). This is a bug — please report it.";
  if (/device unreachable|unreachable|timed out|timeout/i.test(e))
    return "Couldn't reach the device — make sure it's powered on and the IP is correct (try Discover).";
  if (/cloud unreachable/i.test(e))
    return "Couldn't reach Divoom's cloud to discover devices — check your internet connection.";
  if (/private\/LAN IP/i.test(e))
    return "That device IP isn't a local network address.";
  if (/failed to fetch|networkerror|load failed/i.test(e))
    return "Couldn't reach the local bridge — make sure it's running on your machine.";
  return `Unexpected response: ${e}`;
}

/** Verify the device answers and the LocalToken is valid. */
export async function verifyConnection(
  port: number,
  target: string,
  localToken: number,
): Promise<Friendly> {
  try {
    const r = await pushCommand(port, target, {
      Command: "Device/GetDeviceTime",
      LocalToken: localToken,
    });
    return friendly(r, "Connected — your Times Gate responded and the LocalToken works. ✓");
  } catch (e) {
    return { ok: false, msg: humanize((e as Error).message) };
  }
}

export async function discover(port: number): Promise<unknown> {
  const r = await fetch(`${bridgeBase(port)}/discover`, { method: "GET" });
  return r.json();
}

/** Zero-install fallback: a runnable Python snippet that posts the same commands. */
export function generateScript(
  target: string,
  localToken: number,
  commands: Command[],
): string {
  const withToken = commands.map((c) => ({ ...c, LocalToken: localToken }));
  const body = JSON.stringify(withToken, null, 2);
  return `# PixelGate — run this with: python pixelgate_send.py
# Requires: pip install requests
import json, requests

TARGET = "${target}"
COMMANDS = ${body}

for cmd in COMMANDS:
    r = requests.post(f"http://{TARGET}/post", json=cmd, timeout=8)
    print(cmd.get("Command"), "->", r.text)
`;
}
