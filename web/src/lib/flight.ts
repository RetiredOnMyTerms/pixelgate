// Flight tracker with PLUGGABLE providers. Flight status is fetched DIRECTLY from
// the browser with the USER'S OWN key (the key stays in their browser). Each
// provider maps its own response onto one normalized FlightInfo shape below.
//
// Providers (all called direct, key never leaves the browser):
//   • aviationstack — free 100/mo, real-time only, CORS-open
//   • aerodatabox   — via RapidAPI, free ~700/mo, richer data + live position
//   • airlabs       — free ~1000/mo, live position while airborne
//
// Airline logos go through our keyless logo proxy (Kiwi source + CORS), then the
// same pixel-art pipeline as team logos.

import { labelTile, renderAirport, renderBigText, renderThreeLine } from "./render";
import { logoPixelArt } from "./sports";

const LOGO_PROXY = "https://pixelgate.pages.dev/api/airline-logo";

export type FlightStatus =
  | "scheduled" | "active" | "landed" | "cancelled" | "incident" | "diverted" | string;

// One endpoint (departure or arrival). Times are split into DISPLAY digits
// (airport-local wall-clock) and a true UTC instant (for the countdown), because
// providers give these two things differently.
type Endpoint = {
  iata: string;
  tz: string;                 // IANA zone, "" if unknown
  localSched: string | null;  // "YYYY-MM-DDTHH:MM" — digits are airport-local
  localEst: string | null;
  utcSched: number | null;    // epoch ms (true UTC), for the countdown
  utcEst: number | null;
};

export type LivePos = { altFt: number; kt: number };

export type FlightInfo = {
  code: string; // e.g. "DL903"
  status: FlightStatus;
  airline: string;
  airlineIata: string;
  dep: Endpoint;
  arr: Endpoint;
  live: LivePos | null; // altitude/speed while airborne, when the provider gives it
};

const depTime = (e: Endpoint) => e.localEst || e.localSched;
const arrTime = (e: Endpoint) => e.localEst || e.localSched;
const depUTC = (e: Endpoint) => e.utcEst ?? e.utcSched;

// ==========================================================================
// Providers
// ==========================================================================
export type ProviderId = "aviationstack" | "aerodatabox" | "airlabs";

export type ProviderMeta = {
  id: ProviderId;
  name: string;
  signupUrl: string;
  keyLabel: string;
  keyHint: string;
  monthlyBudget: number;
  steps: string[]; // user-friendly setup instructions
  note: string;    // one-line tier summary shown under the field
};

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  aviationstack: {
    id: "aviationstack",
    name: "AviationStack",
    signupUrl: "https://aviationstack.com/signup/free",
    keyLabel: "AviationStack API key",
    keyHint: "your access key (stays in your browser)",
    monthlyBudget: 100,
    steps: [
      "Open aviationstack.com and click “Sign Up Free”.",
      "Confirm your email, then open your Dashboard.",
      "Copy the “API Access Key” shown at the top.",
      "Paste it here — it is stored only in this browser.",
    ],
    note: "Free tier: real-time only, 100 requests/month. Simplest to set up.",
  },
  aerodatabox: {
    id: "aerodatabox",
    name: "AeroDataBox (RapidAPI)",
    signupUrl: "https://rapidapi.com/aedbx-aedbx/api/aerodatabox",
    keyLabel: "RapidAPI key",
    keyHint: "your X-RapidAPI-Key (stays in your browser)",
    monthlyBudget: 700,
    steps: [
      "Create a free account at rapidapi.com.",
      "Open the AeroDataBox API page (link above) and click “Subscribe to Test”.",
      "Pick the free “Basic” plan (~700 requests/month).",
      "On any endpoint, copy the “X-RapidAPI-Key” value from the code snippet.",
      "Paste that key here — stored only in this browser.",
    ],
    note: "Free “Basic” plan: ~700 requests/month, richer data + live altitude/speed.",
  },
  airlabs: {
    id: "airlabs",
    name: "AirLabs",
    signupUrl: "https://airlabs.co/signup",
    keyLabel: "AirLabs API key",
    keyHint: "your api_key (stays in your browser)",
    monthlyBudget: 1000,
    steps: [
      "Sign up free at airlabs.co.",
      "Open your account dashboard.",
      "Copy your “API Key”.",
      "Paste it here — stored only in this browser.",
    ],
    note: "Free tier: ~1000 requests/month. Best while a flight is airborne (live position).",
  },
};

export function providerMeta(id: ProviderId): ProviderMeta {
  return PROVIDERS[id] ?? PROVIDERS.aviationstack;
}

// ---- monthly API budget, tracked PER provider ----------------------------
function ym(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function budgetKey(id: ProviderId): string {
  // keep aviationstack's historical key so existing counts survive the upgrade
  return id === "aviationstack" ? `pixelgate.asCalls.${ym()}` : `pixelgate.calls.${id}.${ym()}`;
}
export function budgetOf(id: ProviderId): number {
  return providerMeta(id).monthlyBudget;
}
export function callsUsed(id: ProviderId): number {
  return Number(localStorage.getItem(budgetKey(id)) || "0");
}
export function callsRemaining(id: ProviderId): number {
  return Math.max(0, budgetOf(id) - callsUsed(id));
}
function recordCall(id: ProviderId) {
  localStorage.setItem(budgetKey(id), String(callsUsed(id) + 1));
}
export class BudgetError extends Error {}

/** Look up a flight by code with the selected provider. Budget-guarded (throws
 * BudgetError at the cap). Throws on a keyed API error; returns null when the
 * flight isn't found. */
export async function fetchFlight(
  provider: ProviderId,
  key: string,
  code: string,
): Promise<FlightInfo | null> {
  if (callsRemaining(provider) <= 0)
    throw new BudgetError(
      `Monthly ${providerMeta(provider).name} limit reached (${budgetOf(provider)}). Resets next month.`,
    );
  const c = code.toUpperCase().replace(/\s+/g, "");
  switch (provider) {
    case "aerodatabox": return fetchAeroDataBox(key, c);
    case "airlabs": return fetchAirLabs(key, c);
    default: return fetchAviationStack(key, c);
  }
}

// ---- time helpers --------------------------------------------------------
// Normalize a provider timestamp to "YYYY-MM-DDTHH:MM" keeping the LOCAL digits
// (drops any timezone offset/suffix). Accepts space or "T" separators.
function localDigits(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : null;
}
// True UTC epoch (ms) for a wall-clock time in `tz`. Used when the provider only
// gives local digits (aviationstack tags a bogus +00:00 offset).
function wallClockToUTC(iso: string | null, tz: string): number | null {
  if (!iso || !tz) return null;
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
  return asUTC - (shown - asUTC);
}
// Parse an explicit-UTC string ("...Z", "...+00:00", or bare "YYYY-MM-DD HH:MM"
// that the provider documents as UTC) into an epoch.
function parseUTC(s: string | null | undefined): number | null {
  if (!s) return null;
  const d = localDigits(s);
  if (!d) return null;
  const m = d.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)!;
  const [, y, mo, dd, h, mi] = m.map(Number) as unknown as number[];
  return Date.UTC(y, mo - 1, dd, h, mi);
}

const mToFt = (m: number) => Math.round(m * 3.28084);
const kmhToKt = (k: number) => Math.round(k * 0.539957);

// ---- aviationstack -------------------------------------------------------
const AS_BASE = "https://api.aviationstack.com/v1/flights";
async function fetchAviationStack(key: string, c: string): Promise<FlightInfo | null> {
  const letters = (c.match(/^[A-Z]+/)?.[0] || "").length;
  const params = letters === 3 ? ["flight_icao", "flight_iata"] : ["flight_iata", "flight_icao"];
  for (const param of params) {
    if (callsRemaining("aviationstack") <= 0) break;
    recordCall("aviationstack");
    const r = await fetch(`${AS_BASE}?access_key=${encodeURIComponent(key)}&${param}=${encodeURIComponent(c)}`);
    if (!r.ok) continue;
    const d = await r.json();
    if (d?.error) throw new Error(d.error.message || d.error.code || "AviationStack error");
    const f = (d?.data ?? [])[0];
    if (f) return parseAviationStack(f);
  }
  return null;
}
function asEndpoint(e: any): Endpoint {
  const tz = e?.timezone ?? "";
  const localSched = localDigits(e?.scheduled);
  const localEst = localDigits(e?.estimated);
  return {
    iata: e?.iata ?? "—",
    tz,
    localSched,
    localEst,
    utcSched: wallClockToUTC(localSched, tz),
    utcEst: wallClockToUTC(localEst, tz),
  };
}
function parseAviationStack(f: any): FlightInfo {
  const live: LivePos | null =
    f.live && !f.live.is_ground && f.live.altitude != null
      ? { altFt: mToFt(Number(f.live.altitude)), kt: kmhToKt(Number(f.live.speed_horizontal || 0)) }
      : null;
  return {
    code: (f.flight?.iata || f.flight?.icao || f.flight?.number || "").toUpperCase(),
    status: f.flight_status ?? "scheduled",
    airline: f.airline?.name ?? "",
    airlineIata: (f.airline?.iata ?? "").toUpperCase(),
    dep: asEndpoint(f.departure),
    arr: asEndpoint(f.arrival),
    live,
  };
}

// ---- aerodatabox (RapidAPI) ---------------------------------------------
const ADB_HOST = "aerodatabox.p.rapidapi.com";
async function fetchAeroDataBox(key: string, c: string): Promise<FlightInfo | null> {
  recordCall("aerodatabox");
  const url =
    `https://${ADB_HOST}/flights/number/${encodeURIComponent(c)}` +
    `?withAircraftImage=false&withLocation=true`;
  const r = await fetch(url, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": ADB_HOST },
  });
  if (r.status === 204) return null; // no flights for that number today
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`AeroDataBox error ${r.status}${t ? `: ${t.slice(0, 120)}` : ""}`);
  }
  const d = await r.json();
  const list: any[] = Array.isArray(d) ? d : d?.flights ?? [];
  if (!list.length) return null;
  // prefer an in-progress leg, else the first
  const f = list.find((x) => /departed|enroute|approaching|arrived/i.test(x.status || "")) || list[0];
  return parseAeroDataBox(f);
}
function adbStatus(s: string): FlightStatus {
  const x = (s || "").toLowerCase();
  if (x.includes("arrived")) return "landed";
  if (x.includes("cancel")) return "cancelled";
  if (x.includes("divert")) return "diverted";
  if (/(departed|enroute|approaching)/.test(x)) return "active";
  return "scheduled";
}
function adbEndpoint(m: any): Endpoint {
  const tz = m?.airport?.timeZone ?? "";
  return {
    iata: m?.airport?.iata ?? m?.airport?.icao ?? "—",
    tz,
    localSched: localDigits(m?.scheduledTime?.local),
    localEst: localDigits(m?.revisedTime?.local || m?.predictedTime?.local),
    utcSched: parseUTC(m?.scheduledTime?.utc),
    utcEst: parseUTC(m?.revisedTime?.utc || m?.predictedTime?.utc),
  };
}
function parseAeroDataBox(f: any): FlightInfo {
  const loc = f?.location;
  const altFt = loc?.altitude?.feet ?? (loc?.altitude?.meters != null ? mToFt(loc.altitude.meters) : null);
  const kt = loc?.groundSpeed?.kt ?? (loc?.groundSpeed?.kmPerHour != null ? kmhToKt(loc.groundSpeed.kmPerHour) : null);
  const live: LivePos | null =
    altFt != null ? { altFt: Math.round(altFt), kt: Math.round(kt ?? 0) } : null;
  return {
    code: (f?.number || "").toUpperCase().replace(/\s+/g, ""),
    status: adbStatus(f?.status),
    airline: f?.airline?.name ?? "",
    airlineIata: (f?.airline?.iata ?? "").toUpperCase(),
    dep: adbEndpoint(f?.departure),
    arr: adbEndpoint(f?.arrival),
    live,
  };
}

// ---- airlabs -------------------------------------------------------------
const AL_BASE = "https://airlabs.co/api/v9/flight";
async function fetchAirLabs(key: string, c: string): Promise<FlightInfo | null> {
  const letters = (c.match(/^[A-Z]+/)?.[0] || "").length;
  const param = letters === 3 ? "flight_icao" : "flight_iata";
  recordCall("airlabs");
  const r = await fetch(`${AL_BASE}?${param}=${encodeURIComponent(c)}&api_key=${encodeURIComponent(key)}`);
  if (!r.ok) throw new Error(`AirLabs error ${r.status}`);
  const d = await r.json();
  if (d?.error) throw new Error(d.error.message || d.error.type || "AirLabs error");
  const f = d?.response;
  if (!f || Array.isArray(f)) return null;
  return parseAirLabs(f);
}
function alStatus(s: string): FlightStatus {
  const x = (s || "").toLowerCase();
  if (x === "landed") return "landed";
  if (x === "cancelled") return "cancelled";
  if (x === "en-route" || x === "active") return "active";
  return "scheduled";
}
// AirLabs gives local ("dep_time") and UTC ("dep_time_utc", documented UTC) strings.
function alEndpoint(iata: string, local: string | null, est: string | null, utc: string | null): Endpoint {
  return {
    iata: iata || "—",
    tz: "",
    localSched: localDigits(local),
    localEst: localDigits(est),
    utcSched: parseUTC(utc),
    utcEst: null,
  };
}
function parseAirLabs(f: any): FlightInfo {
  const live: LivePos | null =
    f.alt != null && (f.status === "en-route" || f.status === "active")
      ? { altFt: mToFt(Number(f.alt)), kt: kmhToKt(Number(f.speed || 0)) }
      : null;
  return {
    code: (f.flight_iata || f.flight_icao || f.flight_number || "").toUpperCase(),
    status: alStatus(f.status),
    airline: f.airline_name ?? f.airline_iata ?? "",
    airlineIata: (f.airline_iata ?? "").toUpperCase(),
    dep: alEndpoint(f.dep_iata, f.dep_time, f.dep_estimated, f.dep_time_utc),
    arr: alEndpoint(f.arr_iata, f.arr_time, f.arr_estimated, f.arr_time_utc),
    live,
  };
}

// ==========================================================================
// Status / cadence / rendering (provider-agnostic — operate on FlightInfo)
// ==========================================================================
export function isOver(f: FlightInfo): boolean {
  return f.status === "landed" || f.status === "cancelled" || f.status === "diverted";
}

// The device display re-renders on this cadence (recomputes the countdown from
// cached data — NO API call). Separate from the data-refresh interval below.
export const DISPLAY_TICK_MS = 60_000;

/** How long cached flight DATA stays fresh before another API call. Kept large to
 * respect the monthly cap: ~30 min when active/near, 1 h within 3 h of the
 * flight, 3 h far out. Returns 0 once the flight is over. */
export function dataRefreshMs(f: FlightInfo): number {
  if (isOver(f)) return 0;
  const now = Date.now();
  const nearMs = 60 * 60_000;
  const depU = depUTC(f.dep);
  const arrU = depUTC(f.arr);
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
  const arrU = depUTC(f.arr);
  if (arrU == null) return false;
  return arrU - Date.now() <= 3 * 60_000 && Date.now() - lastFetch >= 10 * 60_000;
}

// Read the airport-LOCAL wall-clock digits directly for display.
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

/** Screen-2 bottom line: countdown to DEPARTURE before the flight leaves, then to
 * ARRIVAL once it's airborne. */
function remainingLabel(f: FlightInfo): string {
  if (f.status === "landed") return "LANDED";
  if (f.status === "cancelled") return "CANCELLED";
  const airborne = f.status === "active";
  const target = airborne ? depUTC(f.arr) : depUTC(f.dep);
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
 * 3 destination airport · 4 flight code. Screen 2's middle line shows live
 * altitude/speed instead of the departure time once airborne (when available).
 */
export async function renderFlightScreens(f: FlightInfo): Promise<HTMLCanvasElement[]> {
  const logo = labelTile(await logoPixelArt(logoUrl(f.airlineIata)), f.airlineIata || "✈");
  const s1 = renderAirport(f.dep.iata, true); // 🛫 departure
  const airborne = f.status === "active";
  const depLine = `Dep ${localTime(depTime(f.dep))}`;
  const arrLine = `Arr ${localTime(arrTime(f.arr))}`;
  // Once airborne with a live position, swap the departure time for altitude/speed.
  const [l1, l2] =
    airborne && f.live
      ? [arrLine, `FL${String(Math.round(f.live.altFt / 100)).padStart(2, "0")} ${f.live.kt}kt`]
      : [depLine, arrLine];
  const s2 = renderThreeLine(l1, l2, remainingLabel(f), {
    c3: airborne ? "#FFB000" : "#00E5FF",
  });
  const s3 = renderAirport(f.arr.iata, false); // 🛬 arrival
  const s4 = renderBigText(f.code, { color: "#FFFFFF", size: 42 });
  return [logo, s1, s2, s3, s4];
}
