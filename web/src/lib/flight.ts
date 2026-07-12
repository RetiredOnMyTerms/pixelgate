// Flight tracker. Flight status from AviationStack, called DIRECTLY from the
// browser with the USER'S OWN key (CORS-open) — the key stays in their browser.
// Airline logos go through our keyless logo proxy (Kiwi source + CORS), then the
// same pixel-art pipeline as team logos.

import { labelTile, renderBigText, renderThreeLine } from "./render";
import { logoPixelArt } from "./sports";

const AS_BASE = "https://api.aviationstack.com/v1/flights";
const LOGO_PROXY = "https://pixelgate.pages.dev/api/airline-logo";

export type FlightStatus =
  | "scheduled" | "active" | "landed" | "cancelled" | "incident" | "diverted" | string;

type Endpoint = {
  iata: string;
  tz: string;
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
};
export type FlightInfo = {
  code: string; // e.g. "DL903"
  status: FlightStatus;
  airline: string;
  airlineIata: string;
  dep: Endpoint;
  arr: Endpoint;
};

function endpoint(e: any): Endpoint {
  return {
    iata: e?.iata ?? "—",
    tz: e?.timezone ?? "UTC",
    scheduled: e?.scheduled ?? null,
    estimated: e?.estimated ?? null,
    actual: e?.actual ?? null,
  };
}

function parse(f: any): FlightInfo {
  return {
    code: (f.flight?.iata || f.flight?.icao || f.flight?.number || "").toUpperCase(),
    status: f.flight_status ?? "scheduled",
    airline: f.airline?.name ?? "",
    airlineIata: (f.airline?.iata ?? "").toUpperCase(),
    dep: endpoint(f.departure),
    arr: endpoint(f.arrival),
  };
}

/** Look up a flight by code (tries IATA then ICAO). Throws on a keyed API error
 * (bad key, quota); returns null when the flight simply isn't found. */
export async function fetchFlight(key: string, code: string): Promise<FlightInfo | null> {
  const c = code.toUpperCase().replace(/\s+/g, "");
  for (const param of ["flight_iata", "flight_icao"]) {
    const r = await fetch(`${AS_BASE}?access_key=${encodeURIComponent(key)}&${param}=${encodeURIComponent(c)}`);
    if (!r.ok) continue;
    const d = await r.json();
    if (d?.error) throw new Error(d.error.message || d.error.code || "AviationStack error");
    const f = (d?.data ?? [])[0];
    if (f) return parse(f);
  }
  return null;
}

export function isOver(f: FlightInfo): boolean {
  return f.status === "landed" || f.status === "cancelled" || f.status === "diverted";
}

/** Poll fast near/at the flight, slow when far out; never under ~90s (free tier
 * is 1 req/min). Returns 0 when tracking should stop. */
export function flightPollMs(f: FlightInfo): number {
  if (isOver(f)) return 0;
  if (f.status === "active") return 90_000;
  const dep = f.dep.estimated || f.dep.scheduled;
  const mins = dep ? (new Date(dep).getTime() - Date.now()) / 60000 : Infinity;
  if (mins <= 30) return 120_000; // ~2 min close to departure
  if (mins <= 180) return 5 * 60_000; // 5 min within 3h
  return 15 * 60_000; // 15 min far out
}

// AviationStack tags times with a "+00:00" offset but the digits are actually
// the airport's LOCAL wall-clock time — so we read the digits directly (no
// timezone conversion) for display.
function localTime(iso: string | null): string {
  if (!iso) return "--:--";
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return "--:--";
  let h = Number(m[1]);
  const min = m[2];
  const ap = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  return `${h}:${min}${ap}`;
}

// True UTC instant for a wall-clock time that belongs to `tz` (needed for the
// countdown, since the ISO's +00:00 offset is bogus).
function wallClockToUTC(iso: string | null, tz: string): number | null {
  if (!iso) return null;
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  const asUTC = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(asUTC));
  const p: Record<string, string> = {};
  for (const x of parts) p[x.type] = x.value;
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === "24" ? 0 : p.hour), +p.minute);
  return asUTC - (shown - asUTC); // subtract the tz offset
}

/** Screen-2 bottom line: countdown to DEPARTURE before the flight leaves, then to
 * ARRIVAL once it's airborne. */
function remainingLabel(f: FlightInfo): string {
  if (f.status === "landed") return "LANDED";
  if (f.status === "cancelled") return "CANCELLED";
  const airborne = f.status === "active";
  const target = airborne
    ? wallClockToUTC(f.arr.estimated || f.arr.scheduled, f.arr.tz)
    : wallClockToUTC(f.dep.estimated || f.dep.scheduled, f.dep.tz);
  if (target == null) return airborne ? "in air" : "scheduled";
  const ms = target - Date.now();
  if (ms <= 0) return airborne ? "landing" : "departing";
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const t = h > 0 ? `${h}h${String(m).padStart(2, "0")}m` : `${m}m`;
  return `${t} left`;
}

const logoUrl = (iata: string) => `${LOGO_PROXY}?iata=${encodeURIComponent(iata)}`;

/**
 * 5 screens: 0 airline logo · 1 origin airport · 2 dep/arr/remaining ·
 * 3 destination airport · 4 flight code.
 */
export async function renderFlightScreens(f: FlightInfo): Promise<HTMLCanvasElement[]> {
  const logo = labelTile(await logoPixelArt(logoUrl(f.airlineIata)), f.airlineIata || "✈");
  const s1 = renderBigText(f.dep.iata, { color: "#7FE9FF" });
  const s2 = renderThreeLine(
    `Dep ${localTime(f.dep.estimated || f.dep.scheduled)}`,
    `Arr ${localTime(f.arr.estimated || f.arr.scheduled)}`,
    remainingLabel(f),
    { c3: f.status === "active" ? "#FFB000" : "#00E5FF" },
  );
  const s3 = renderBigText(f.arr.iata, { color: "#7FE9FF" });
  const s4 = renderBigText(f.code, { color: "#FFFFFF", size: 42 });
  return [logo, s1, s2, s3, s4];
}
