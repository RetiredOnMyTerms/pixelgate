// Generic ESPN scoreboard core for any league (NFL, MLB, …). ESPN's site API has
// the same shape across sports, so the client, game model, logo pixel-art and the
// 5-screen layout are all shared; each league only supplies its roster and how to
// render the middle "situation" screen during a live game.
//
// ESPN sends Access-Control-Allow-Origin: * on scoreboard/per-team/logo endpoints
// (the /teams LIST endpoint is browser-CORS-blocked, so rosters are hardcoded).
// Everything degrades to null/"—" on error.

import {
  loadImage,
  renderBigText,
  renderLogoPixelArt,
  renderTwoLine,
} from "./render";

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
  const mk = (t: any): GameTeam => ({
    id: String(t.team.id),
    abbr: t.team.abbreviation,
    logo:
      t.team.logo ??
      `https://a.espncdn.com/i/teamlogos/${""}/500/${String(t.team.abbreviation).toLowerCase()}.png`,
    score: String(t.score ?? ""),
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
const logoCache = new Map<string, HTMLCanvasElement>();
export async function logoPixelArt(url: string): Promise<HTMLCanvasElement> {
  const cached = logoCache.get(url);
  if (cached) return cached;
  const canvas = renderLogoPixelArt(await loadImage(url), { bg: "#FFFFFF" });
  logoCache.set(url, canvas);
  return canvas;
}

/** 0 away logo · 1 away score · 2 situation/date · 3 home score · 4 home logo. */
export async function renderScreens(game: Game, league: League): Promise<HTMLCanvasElement[]> {
  const [awayLogo, homeLogo] = await Promise.all([
    logoPixelArt(game.away.logo),
    logoPixelArt(game.home.logo),
  ]);
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
    s1 = renderBigText(game.away.score, { color: "#FFFFFF" });
    s3 = renderBigText(game.home.score, { color: "#FFFFFF" });
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
  return [awayLogo, s1, s2, s3, homeLogo];
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

export const LEAGUES: Record<string, League> = {
  nfl: {
    id: "nfl",
    name: "NFL",
    path: "football/nfl",
    liveMiddle: NFL_LIVE,
    teams: roster("football/nfl", [
      ["22", "ARI", "Arizona Cardinals"], ["1", "ATL", "Atlanta Falcons"],
      ["33", "BAL", "Baltimore Ravens"], ["2", "BUF", "Buffalo Bills"],
      ["29", "CAR", "Carolina Panthers"], ["3", "CHI", "Chicago Bears"],
      ["4", "CIN", "Cincinnati Bengals"], ["5", "CLE", "Cleveland Browns"],
      ["6", "DAL", "Dallas Cowboys"], ["7", "DEN", "Denver Broncos"],
      ["8", "DET", "Detroit Lions"], ["9", "GB", "Green Bay Packers"],
      ["34", "HOU", "Houston Texans"], ["11", "IND", "Indianapolis Colts"],
      ["30", "JAX", "Jacksonville Jaguars"], ["12", "KC", "Kansas City Chiefs"],
      ["24", "LAC", "Los Angeles Chargers"], ["14", "LAR", "Los Angeles Rams"],
      ["13", "LV", "Las Vegas Raiders"], ["15", "MIA", "Miami Dolphins"],
      ["16", "MIN", "Minnesota Vikings"], ["17", "NE", "New England Patriots"],
      ["18", "NO", "New Orleans Saints"], ["19", "NYG", "New York Giants"],
      ["20", "NYJ", "New York Jets"], ["21", "PHI", "Philadelphia Eagles"],
      ["23", "PIT", "Pittsburgh Steelers"], ["26", "SEA", "Seattle Seahawks"],
      ["25", "SF", "San Francisco 49ers"], ["27", "TB", "Tampa Bay Buccaneers"],
      ["10", "TEN", "Tennessee Titans"], ["28", "WSH", "Washington Commanders"],
    ]),
  },
  mlb: {
    id: "mlb",
    name: "MLB",
    path: "baseball/mlb",
    liveMiddle: MLB_LIVE,
    teams: roster("baseball/mlb", [
      ["29", "ARI", "Arizona Diamondbacks"], ["11", "ATH", "Athletics"],
      ["15", "ATL", "Atlanta Braves"], ["1", "BAL", "Baltimore Orioles"],
      ["2", "BOS", "Boston Red Sox"], ["16", "CHC", "Chicago Cubs"],
      ["4", "CHW", "Chicago White Sox"], ["17", "CIN", "Cincinnati Reds"],
      ["5", "CLE", "Cleveland Guardians"], ["27", "COL", "Colorado Rockies"],
      ["6", "DET", "Detroit Tigers"], ["18", "HOU", "Houston Astros"],
      ["7", "KC", "Kansas City Royals"], ["3", "LAA", "Los Angeles Angels"],
      ["19", "LAD", "Los Angeles Dodgers"], ["28", "MIA", "Miami Marlins"],
      ["8", "MIL", "Milwaukee Brewers"], ["9", "MIN", "Minnesota Twins"],
      ["21", "NYM", "New York Mets"], ["10", "NYY", "New York Yankees"],
      ["22", "PHI", "Philadelphia Phillies"], ["23", "PIT", "Pittsburgh Pirates"],
      ["25", "SD", "San Diego Padres"], ["26", "SF", "San Francisco Giants"],
      ["12", "SEA", "Seattle Mariners"], ["24", "STL", "St. Louis Cardinals"],
      ["30", "TB", "Tampa Bay Rays"], ["13", "TEX", "Texas Rangers"],
      ["14", "TOR", "Toronto Blue Jays"], ["20", "WSH", "Washington Nationals"],
    ]),
  },
};
