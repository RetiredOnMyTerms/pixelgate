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
