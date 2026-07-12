// Flight tracker. Flight status from AviationStack, called DIRECTLY from the
// browser with the USER'S OWN key (CORS-open) — the key stays in their browser.
// Airline logos go through our keyless logo proxy (Kiwi source + CORS), then the
// same pixel-art pipeline as team logos.

import { labelTile, renderAirport, renderBigText, renderThreeLine } from "./render";
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

// ---- monthly API budget (free tier = 100/month) --------------------------
export const MONTHLY_BUDGET = 100;
function budgetKey(): string {
  const d = new Date();
  return `pixelgate.asCalls.${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function callsUsed(): number {
  return Number(localStorage.getItem(budgetKey()) || "0");
}
export function callsRemaining(): number {
  return Math.max(0, MONTHLY_BUDGET - callsUsed());
}
function recordCall() {
  localStorage.setItem(budgetKey(), String(callsUsed() + 1));
}
export class BudgetError extends Error {}

/** Look up a flight by code. Picks IATA vs ICAO by airline-prefix length so the
 * common case is ONE call. Budget-guarded (throws BudgetError at the cap).
 * Throws on a keyed API error; returns null when the flight isn't found. */
export async function fetchFlight(key: string, code: string): Promise<FlightInfo | null> {
  if (callsRemaining() <= 0)
    throw new BudgetError(`Monthly API limit reached (${MONTHLY_BUDGET}). Resets next month.`);
  const c = code.toUpperCase().replace(/\s+/g, "");
  const letters = (c.match(/^[A-Z]+/)?.[0] || "").length;
  const params = letters === 3 ? ["flight_icao", "flight_iata"] : ["flight_iata", "flight_icao"];
  for (const param of params) {
    if (callsRemaining() <= 0) break;
    recordCall();
    const r = await fetch(`${AS_BASE}?access_key=${encodeURIComponent(key)}&${param}=${encodeURIComponent(c)}`);
    if (!r.ok) continue;
    const d = await r.json();
    if (d?.error) throw new Error(d.error.message || d.error.code || "AviationStack error");
    const f = (d?.data ?? [])[0];
    if (f) return parse(f); // right param matched -> stop (1 call)
  }
  return null;
}

export function isOver(f: FlightInfo): boolean {
  return f.status === "landed" || f.status === "cancelled" || f.status === "diverted";
}

// The device display re-renders on this cadence (recomputes the countdown from
// cached data — NO API call). Separate from the data-refresh interval below.
export const DISPLAY_TICK_MS = 60_000;

/** How long cached flight DATA stays fresh before another API call. Kept large to
 * respect the 100/month cap: ~30 min when active/near, 1 h within 3 h of the
 * flight, 3 h far out. Returns 0 once the flight is over. */
export function dataRefreshMs(f: FlightInfo): number {
  if (isOver(f)) return 0;
  const now = Date.now();
  const nearMs = 60 * 60_000;
  const depU = wallClockToUTC(f.dep.estimated || f.dep.scheduled, f.dep.tz);
  const arrU = wallClockToUTC(f.arr.estimated || f.arr.scheduled, f.arr.tz);
  const near = (t: number | null) => t != null && Math.abs(t - now) <= nearMs;
  if (f.status === "active" || near(depU) || near(arrU)) return 30 * 60_000;
  const minsToDep = depU != null ? (depU - now) / 60000 : Infinity;
  if (minsToDep <= 180) return 60 * 60_000;
  return 3 * 60 * 60_000;
}

/** True when the flight should be re-checked NOW to catch a landing the local
 * countdown can't see (arrival is essentially due but status is still active). */
export function shouldConfirmLanding(f: FlightInfo, lastFetch: number): boolean {
  if (f.status !== "active") return false;
  const arrU = wallClockToUTC(f.arr.estimated || f.arr.scheduled, f.arr.tz);
  if (arrU == null) return false;
  return arrU - Date.now() <= 3 * 60_000 && Date.now() - lastFetch >= 10 * 60_000;
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
  const s1 = renderAirport(f.dep.iata, true); // 🛫 departure
  const s2 = renderThreeLine(
    `Dep ${localTime(f.dep.estimated || f.dep.scheduled)}`,
    `Arr ${localTime(f.arr.estimated || f.arr.scheduled)}`,
    remainingLabel(f),
    { c3: f.status === "active" ? "#FFB000" : "#00E5FF" },
  );
  const s3 = renderAirport(f.arr.iata, false); // 🛬 arrival
  const s4 = renderBigText(f.code, { color: "#FFFFFF", size: 42 });
  return [logo, s1, s2, s3, s4];
}
