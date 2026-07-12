// ESPN (unofficial, no-key) NFL client + logo pixel-art. ESPN sends
// Access-Control-Allow-Origin: * on both JSON and logo images, so this all runs
// in the browser — no proxy needed. Everything degrades to null/"—" on error
// (ESPN can change or rate-limit the undocumented endpoints).

import {
  loadImage,
  renderBigText,
  renderLogoPixelArt,
  renderTwoLine,
} from "./render";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

export type NflTeam = {
  id: string;
  abbreviation: string;
  displayName: string;
  shortName: string;
  color: string; // hex, no '#'
  altColor: string; // hex, no '#'
  logo: string; // full logo URL
};

// The 32 teams are static, and ESPN's /teams LIST endpoint fails CORS in the
// browser (the per-team /teams/{id} and scoreboard endpoints work fine), so we
// hardcode the roster. id = ESPN team id (matches scoreboard competitors); logo
// follows the stable CDN pattern.
const ROSTER: [string, string, string][] = [
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
];

const NFL_TEAMS: NflTeam[] = ROSTER.map(([id, abbr, name]) => ({
  id,
  abbreviation: abbr,
  displayName: name,
  shortName: abbr,
  color: "222222",
  altColor: "FFFFFF",
  logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`,
})).sort((a, b) => a.displayName.localeCompare(b.displayName));

export async function fetchTeams(): Promise<NflTeam[]> {
  return NFL_TEAMS;
}

// Converted logos are cached (by team id) so we don't reprocess every poll.
const logoCache = new Map<string, HTMLCanvasElement>();

/** Logo pixel-art canvas by logo URL (cached by URL). */
async function logoPixelArt(url: string): Promise<HTMLCanvasElement> {
  const cached = logoCache.get(url);
  if (cached) return cached;
  const canvas = renderLogoPixelArt(await loadImage(url), { bg: "#FFFFFF" });
  logoCache.set(url, canvas);
  return canvas;
}

export async function teamLogoPixelArt(team: NflTeam): Promise<HTMLCanvasElement> {
  return logoPixelArt(team.logo);
}

// ---- game model ----------------------------------------------------------

export type GameState = "pre" | "in" | "post";
export type GameTeam = { id: string; abbr: string; logo: string; score: string };
export type NflGame = {
  state: GameState;
  dateUTC: string;
  detail: string; // status.type.detail (kickoff string / "Final")
  period: number; // 1-4, 5 = OT
  clock: string; // displayClock, e.g. "12:34"
  downDistance: string | null; // situation.shortDownDistanceText (live only)
  possession: string | null; // team id with the ball (live only)
  home: GameTeam;
  away: GameTeam;
};

function parseGame(e: any): NflGame {
  const c = e.competitions?.[0] ?? {};
  const st = e.status ?? c.status ?? {};
  const type = st.type ?? {};
  const mk = (t: any): GameTeam => ({
    id: String(t.team.id),
    abbr: t.team.abbreviation,
    logo:
      t.team.logo ??
      `https://a.espncdn.com/i/teamlogos/nfl/500/${String(t.team.abbreviation).toLowerCase()}.png`,
    score: String(t.score ?? ""),
  });
  const comps = c.competitors ?? [];
  const home = mk(comps.find((t: any) => t.homeAway === "home") ?? comps[0]);
  const away = mk(comps.find((t: any) => t.homeAway === "away") ?? comps[1] ?? comps[0]);
  const sit = c.situation;
  return {
    state: (type.state ?? "pre") as GameState,
    dateUTC: e.date,
    detail: type.detail ?? type.shortDetail ?? "",
    period: st.period ?? 0,
    clock: st.displayClock ?? "",
    downDistance: sit?.shortDownDistanceText ?? null,
    possession: sit?.possession != null ? String(sit.possession) : null,
    home,
    away,
  };
}

async function fetchScoreboard(): Promise<any[]> {
  const r = await fetch(`${BASE}/scoreboard`);
  if (!r.ok) throw new Error(`ESPN scoreboard ${r.status}`);
  const d = await r.json();
  return d?.events ?? [];
}

/** The team's game: this week's scoreboard first, else the team's next event.
 * Returns null on total failure (caller shows a "no data" state). */
export async function fetchTeamGame(teamId: string): Promise<NflGame | null> {
  try {
    const events = await fetchScoreboard();
    const e = events.find((ev: any) =>
      (ev.competitions?.[0]?.competitors ?? []).some(
        (t: any) => String(t.team.id) === teamId,
      ),
    );
    if (e) return parseGame(e);
  } catch {
    /* fall through to nextEvent */
  }
  try {
    const r = await fetch(`${BASE}/teams/${teamId}`);
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

/** How often to poll: fast while a game is live, slow otherwise. */
export function pollIntervalMs(game: NflGame | null): number {
  return game?.state === "in" ? 12_000 : 7 * 60_000;
}

// ---- 5-screen layout -----------------------------------------------------
// Fixed roles: 0 away logo, 1 away score, 2 quarter+down / date-time,
// 3 home score, 4 home logo. Home/away come from the game, not the fav team.

export async function renderNflScreens(game: NflGame): Promise<HTMLCanvasElement[]> {
  const [awayLogo, homeLogo] = await Promise.all([
    logoPixelArt(game.away.logo),
    logoPixelArt(game.home.logo),
  ]);

  let s1: HTMLCanvasElement; // away side
  let s2: HTMLCanvasElement; // middle
  let s3: HTMLCanvasElement; // home side

  if (game.state === "pre") {
    // No live game: middle three show the fixture; logos still show the teams.
    const dt = new Date(game.dateUTC);
    const weekday = dt.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
    const date = dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
    const time = dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    // Middle three = the fixture: weekday | date | kickoff time (local).
    s1 = renderBigText(weekday, { color: "#7FE9FF", size: 54 });
    s2 = renderBigText(date, { color: "#FFFFFF", size: 56 });
    s3 = renderBigText(time, { color: "#7FE9FF", size: 44 });
  } else {
    s1 = renderBigText(game.away.score, { color: "#FFFFFF" });
    s3 = renderBigText(game.home.score, { color: "#FFFFFF" });
    if (game.state === "in") {
      const q = game.period > 4 ? "OT" : `Q${game.period}`;
      s2 = renderTwoLine(q, game.downDistance ?? game.clock, {
        topColor: "#00E5FF",
        bottomColor: "#FFB000",
      });
    } else {
      s2 = renderTwoLine("FINAL", "", { topColor: "#FF5A5A" });
    }
  }
  return [awayLogo, s1, s2, s3, homeLogo];
}
