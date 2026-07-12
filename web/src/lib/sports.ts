// Generic ESPN scoreboard core for any league (NFL, MLB, …). ESPN's site API has
// the same shape across sports, so the client, game model, logo pixel-art and the
// 5-screen layout are all shared; each league only supplies its roster and how to
// render the middle "situation" screen during a live game.
//
// ESPN sends Access-Control-Allow-Origin: * on scoreboard/per-team/logo endpoints
// (the /teams LIST endpoint is browser-CORS-blocked, so rosters are hardcoded).
// Everything degrades to null/"—" on error.

import {
  labelTile,
  loadImage,
  renderBigText,
  renderLogoPixelArt,
  renderTwoLine,
} from "./render";
import { ROSTERS } from "./rosters";

const API = "https://site.api.espn.com/apis/site/v2/sports";

export type SportsTeam = { id: string; abbr: string; name: string; logo: string };
export type GameState = "pre" | "in" | "post";
export type GameTeam = { id: string; abbr: string; logo: string; score: string };
export type Game = {
  state: GameState;
  dateUTC: string;
  home: GameTeam;
  away: GameTeam;
  period: number;
  clock: string;
  shortDetail: string;
  situation: any; // league-specific; read by League.liveMiddle
};

export type TwoLine = { top: string; bottom: string; topColor?: string; bottomColor?: string };
export type League = {
  id: string;
  name: string;
  group: string; // dropdown grouping ("US" / "Soccer")
  path: string; // ESPN sport/league path, e.g. "football/nfl"
  teams: SportsTeam[];
  liveMiddle: (g: Game) => TwoLine; // screen-2 content while a game is live
};

// ---- teams -----------------------------------------------------------------
function roster(path: string, rows: [string, string, string][]): SportsTeam[] {
  const league = path.split("/")[1];
  return rows
    .map(([id, abbr, name]) => ({
      id,
      abbr,
      name,
      logo: `https://a.espncdn.com/i/teamlogos/${league}/500/${abbr.toLowerCase()}.png`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- game fetch/parse ------------------------------------------------------
function parseGame(e: any): Game {
  const c = e.competitions?.[0] ?? {};
  const st = e.status ?? c.status ?? {};
  const type = st.type ?? {};
  // score is a string in some sports but an object ({displayValue,value}) in
  // others (NBA/NHL) — coerce both to a display string.
  const scoreStr = (s: any): string => {
    if (s == null) return "";
    if (typeof s === "object") return String(s.displayValue ?? s.value ?? "");
    return String(s);
  };
  const mk = (t: any): GameTeam => ({
    id: String(t.team.id),
    abbr: t.team.abbreviation,
    // scoreboard events carry team.logo; nextEvent (fallback) carries team.logos[].
    logo: t.team.logo ?? t.team.logos?.[0]?.href ?? "",
    score: scoreStr(t.score),
  });
  const comps = c.competitors ?? [];
  return {
    state: (type.state ?? "pre") as GameState,
    dateUTC: e.date,
    home: mk(comps.find((t: any) => t.homeAway === "home") ?? comps[0]),
    away: mk(comps.find((t: any) => t.homeAway === "away") ?? comps[1] ?? comps[0]),
    period: st.period ?? 0,
    clock: st.displayClock ?? "",
    shortDetail: type.shortDetail ?? type.detail ?? "",
    situation: c.situation ?? {},
  };
}

/** The team's game: this week/day's scoreboard first, else the team's next event. */
export async function fetchTeamGame(path: string, teamId: string): Promise<Game | null> {
  try {
    const r = await fetch(`${API}/${path}/scoreboard`);
    if (r.ok) {
      const d = await r.json();
      const e = (d?.events ?? []).find((ev: any) =>
        (ev.competitions?.[0]?.competitors ?? []).some((t: any) => String(t.team.id) === teamId),
      );
      if (e) return parseGame(e);
    }
  } catch {
    /* fall through */
  }
  try {
    const r = await fetch(`${API}/${path}/teams/${teamId}`);
    if (r.ok) {
      const d = await r.json();
      const ne = d?.team?.nextEvent?.[0];
      if (ne) return parseGame(ne);
    }
  } catch {
    /* no data */
  }
  return null;
}

/** Fast while live, slow when idle. */
export function pollIntervalMs(game: Game | null): number {
  return game?.state === "in" ? 12_000 : 7 * 60_000;
}

// ---- logos + 5-screen layout ----------------------------------------------
function blankLogo(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, 128, 128);
  return c;
}

const logoCache = new Map<string, HTMLCanvasElement>();
/** Logo pixel-art (cached). A missing/failed logo yields a blank tile rather
 * than blanking the whole widget. */
export async function logoPixelArt(url: string): Promise<HTMLCanvasElement> {
  if (!url) return blankLogo();
  const cached = logoCache.get(url);
  if (cached) return cached;
  try {
    const canvas = renderLogoPixelArt(await loadImage(url), { bg: "#FFFFFF" });
    logoCache.set(url, canvas);
    return canvas;
  } catch {
    return blankLogo();
  }
}

// Display order: soccer (all leagues) lists the HOME team first (left); US
// leagues list the AWAY team first ("away @ home").
export function homeFirst(l: League): boolean {
  return l.group === "Soccer";
}

/** left logo · left score · situation/date · right score · right logo. */
export async function renderScreens(game: Game, league: League): Promise<HTMLCanvasElement[]> {
  const hf = homeFirst(league);
  const left = hf ? game.home : game.away;
  const right = hf ? game.away : game.home;
  const [leftLogoRaw, rightLogoRaw] = await Promise.all([
    logoPixelArt(left.logo),
    logoPixelArt(right.logo),
  ]);
  const leftLogo = labelTile(leftLogoRaw, left.abbr);
  const rightLogo = labelTile(rightLogoRaw, right.abbr);
  let s1: HTMLCanvasElement, s2: HTMLCanvasElement, s3: HTMLCanvasElement;

  if (game.state === "pre") {
    const dt = new Date(game.dateUTC);
    const weekday = dt.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
    const date = dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
    const time = dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    s1 = renderBigText(weekday, { color: "#7FE9FF", size: 54 });
    s2 = renderBigText(date, { color: "#FFFFFF", size: 56 });
    s3 = renderBigText(time, { color: "#7FE9FF", size: 44 });
  } else {
    s1 = renderBigText(left.score, { color: "#FFFFFF" });
    s3 = renderBigText(right.score, { color: "#FFFFFF" });
    if (game.state === "in") {
      const m = league.liveMiddle(game);
      s2 = renderTwoLine(m.top, m.bottom, {
        topColor: m.topColor ?? "#00E5FF",
        bottomColor: m.bottomColor ?? "#FFB000",
      });
    } else {
      s2 = renderTwoLine("FINAL", "", { topColor: "#FF5A5A" });
    }
  }
  return [leftLogo, s1, s2, s3, rightLogo];
}

// ---- league configs --------------------------------------------------------
const NFL_LIVE = (g: Game): TwoLine => ({
  top: g.period > 4 ? "OT" : `Q${g.period}`,
  bottom: g.situation?.shortDownDistanceText ?? g.clock ?? "",
});

// Baseball: inning half + number on top, outs + count below (defensive — the
// live situation shape is verified against a real game in-season).
const MLB_LIVE = (g: Game): TwoLine => {
  const sd = g.shortDetail || "";
  const half = /^top/i.test(sd) ? "T" : /^(bot|bottom)/i.test(sd) ? "B" : /^mid/i.test(sd) ? "M" : /^end/i.test(sd) ? "E" : "";
  const top = g.period ? `${half}${g.period}` : sd;
  const s = g.situation ?? {};
  const outs = s.outs != null ? `${s.outs} OUT` : "";
  const count = s.balls != null && s.strikes != null ? `${s.balls}-${s.strikes}` : "";
  const bottom = [outs, count].filter(Boolean).join(" · ") || sd;
  return { top, bottom };
};

// Basketball: quarter + game clock.
const NBA_LIVE = (g: Game): TwoLine => ({
  top: g.period > 4 ? "OT" : `Q${g.period}`,
  bottom: g.clock || g.shortDetail,
});
// Hockey: period (4 = OT, 5 = SO) + clock.
const NHL_LIVE = (g: Game): TwoLine => ({
  top: g.period > 3 ? (g.period >= 5 ? "SO" : "OT") : `P${g.period}`,
  bottom: g.clock || g.shortDetail,
});
// Soccer: match minute / HT (ESPN puts it in shortDetail, e.g. "67'", "HT").
const SOCCER_LIVE = (g: Game): TwoLine => ({
  top: g.shortDetail || (g.clock ? g.clock : ""),
  bottom: "",
});

type Meta = { name: string; group: string; path: string; live: (g: Game) => TwoLine };
const META: Record<string, Meta> = {
  nfl: { name: "NFL", group: "US", path: "football/nfl", live: NFL_LIVE },
  nba: { name: "NBA", group: "US", path: "basketball/nba", live: NBA_LIVE },
  mlb: { name: "MLB", group: "US", path: "baseball/mlb", live: MLB_LIVE },
  nhl: { name: "NHL", group: "US", path: "hockey/nhl", live: NHL_LIVE },
  mls: { name: "MLS", group: "Soccer", path: "soccer/usa.1", live: SOCCER_LIVE },
  epl: { name: "Premier League", group: "Soccer", path: "soccer/eng.1", live: SOCCER_LIVE },
  eflc: { name: "Championship", group: "Soccer", path: "soccer/eng.2", live: SOCCER_LIVE },
  ligue1: { name: "Ligue 1", group: "Soccer", path: "soccer/fra.1", live: SOCCER_LIVE },
  laliga: { name: "La Liga", group: "Soccer", path: "soccer/esp.1", live: SOCCER_LIVE },
  bundesliga: { name: "Bundesliga", group: "Soccer", path: "soccer/ger.1", live: SOCCER_LIVE },
  seriea: { name: "Serie A", group: "Soccer", path: "soccer/ita.1", live: SOCCER_LIVE },
};

export const LEAGUES: Record<string, League> = Object.fromEntries(
  Object.entries(META).map(([id, m]) => [
    id,
    {
      id,
      name: m.name,
      group: m.group,
      path: m.path,
      liveMiddle: m.live,
      teams: roster(m.path, ROSTERS[id] ?? []),
    } satisfies League,
  ]),
);
