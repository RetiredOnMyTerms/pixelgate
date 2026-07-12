import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Container,
  Flex,
  Grid,
  Heading,
  Link,
  Select,
  Separator,
  Slider,
  Switch,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { loadConfig, saveConfig, type Config } from "./lib/store";
import {
  detectBridge,
  discover,
  friendly,
  generateScript,
  pushSequence,
  verifyConnection,
  type BridgeStatus,
  type Friendly,
} from "./lib/bridge";
import {
  buildAnimation,
  buildDigitalClock,
  buildScrollingText,
  canvasToJpegBase64,
  commandList,
  lcdMask,
  nextPicId,
  resetHttpGifId,
  resetPicIdCounter,
  sendHttpGifFrame,
  SCREEN_COUNT,
  type BgPreset,
  type Command,
} from "./lib/timesgate";
import {
  imageFileToCanvas,
  renderCradleScreen,
  renderDigital,
  renderNewtonsCradle,
  renderSolid,
  renderText,
  renderWeather,
  renderWeatherSpread,
  renderWrapped,
} from "./lib/render";
import { fetchWeather, type WeatherData } from "./lib/weather";
import { createCrawl, createRain, createStarship, type Effect } from "./lib/effects";
import { fetchQuote, quoteMarquee, ZEN_ATTRIBUTION, type Quote } from "./lib/quote";
import {
  fetchTeamGame,
  homeFirst,
  LEAGUES,
  pollIntervalMs,
  renderScreens,
  type Game,
} from "./lib/sports";
import {
  budgetOf,
  BudgetError,
  callsRemaining,
  dataRefreshMs,
  DISPLAY_TICK_MS,
  fetchFlight,
  isOver,
  PROVIDERS,
  providerMeta,
  renderFlightScreens,
  shouldConfirmLanding,
  type FlightInfo,
  type ProviderId,
} from "./lib/flight";

const APP_VERSION = "0.14.1";

type TemplateId =
  | "solid" | "digital" | "ball" | "image" | "text" | "scores" | "flight" | "weather" | "quote"
  | "rain" | "crawl" | "starship";
const TEMPLATE_LABEL: Record<TemplateId, string> = {
  digital: "Digital clock",
  text: "Marquee",
  ball: "Newton's cradle",
  image: "Image",
  solid: "Solid colour",
  scores: "Sports scoreboard",
  flight: "Flight tracker",
  weather: "Weather",
  quote: "Quote of the day",
  rain: "Digital rain",
  crawl: "Opening crawl",
  starship: "Starship flyby",
};
const GROUPS: { label: string; items: TemplateId[] }[] = [
  { label: "Clock", items: ["digital"] },
  { label: "Text", items: ["text"] },
  { label: "Graphics", items: ["ball", "image", "solid"] },
  { label: "Live", items: ["scores", "flight"] },
  { label: "Data", items: ["weather", "quote"] },
  { label: "Effects", items: ["rain", "crawl", "starship"] },
];
const EFFECT_IDS: TemplateId[] = ["rain", "crawl", "starship"];

const DEFAULT_TEAM: Record<string, string> = { nfl: "26", mlb: "12" };
function loadFav(league: string): string {
  return (
    localStorage.getItem(`pixelgate.fav.${league}`) ||
    DEFAULT_TEAM[league] ||
    LEAGUES[league].teams[0].id
  );
}

const BG_PRESETS: BgPreset[] = ["dark", "black", "navy", "plum", "white"];
const BG_PRESET_HEX: Record<BgPreset, string> = {
  dark: "#05070F",
  black: "#000000",
  navy: "#0A1030",
  plum: "#1A081E",
  white: "#F0F0F0",
};

const GITHUB_URL = "https://github.com/RetiredOnMyTerms/pixelgate";
const FAQ: { q: string; a: string }[] = [
  {
    q: "What is PixelGate?",
    a: "An unofficial web app to design and push visuals — clocks, marquees, animations, and live sports scoreboards — to a Divoom Times Gate's five screens. Not affiliated with Divoom.",
  },
  {
    q: "Why do I need the local bridge?",
    a: "A hosted HTTPS page can't talk to the device directly: it's HTTP-only on your private network and sends no CORS headers. The small bridge runs on your own machine (127.0.0.1) and relays commands to the device. Nothing device-related leaves your LAN.",
  },
  {
    q: "Where do I find my LocalToken?",
    a: 'In the Divoom phone app: tap your Times Gate → Settings → Local Token. Use the "Where do I find my LocalToken?" helper near the top for annotated screenshots.',
  },
  {
    q: "Is my data sent to any server?",
    a: "No. Your device IP and LocalToken live only in your browser (localStorage) and the local bridge. The hosted app never receives them.",
  },
  {
    q: "Where do the sports scores come from?",
    a: 'ESPN\'s free public API, fetched directly in your browser (no key). It\'s undocumented, so it can change or rate-limit — the widget shows a "no data" state rather than crashing.',
  },
  {
    q: "A team logo looks blurry — why?",
    a: "Logos are quantized into pixel-art for the 128×128 LCDs. Each tile is labelled with the team abbreviation so you can always tell who's who.",
  },
];

// User-facing highlights (full technical log lives in CHANGELOG.md on GitHub).
const CHANGES: { v: string; notes: string[] }[] = [
  {
    v: "0.14",
    notes: [
      "Weather can now spread across all 5 screens — city / condition / temperature / high / low, one big tile per screen (or keep the single-tile layout).",
    ],
  },
  {
    v: "0.13",
    notes: [
      "Quote of the Day widget — today's quote from ZenQuotes as a scrolling marquee (quote → author → attribution) on any assigned screen(s).",
    ],
  },
  {
    v: "0.12",
    notes: [
      "Visual Effects: three animated effects with Play/Stop — Digital rain (Matrix binary), Opening crawl (yellow perspective scroll text you can type yourself), and a pixel-art Starship flyby across all 5 screens.",
      "Effects run on one screen or stretched across all 5, and revert to your previous display when stopped.",
    ],
  },
  {
    v: "0.11",
    notes: [
      "Weather widget: enter a city for live current conditions from Open-Meteo (no API key) — icon, temperature in both °F and °C, and today's high / low.",
    ],
  },
  {
    v: "0.9–0.10",
    notes: [
      "Flight tracker: enter a flight number to show airline, origin/destination airports (🛫/🛬), times and a live countdown across the 5 screens.",
      "Choose your data provider — AviationStack, AeroDataBox or AirLabs — each with its own free key and setup guide.",
      "Live altitude/speed shown while airborne; auto-update stays within each provider's free monthly cap.",
    ],
  },
  { v: "0.8.0", notes: ["New Radix-themed UI; display options grouped by category.", "On-page changelog and FAQ."] },
  {
    v: "0.5–0.7",
    notes: [
      "Sports scoreboard: NFL, NBA, MLB, NHL + 7 soccer leagues (MLS, Premier League, Championship, Ligue 1, La Liga, Bundesliga, Serie A).",
      "Team logos as pixel-art with abbreviation labels; upcoming / live / final states; auto-update polling (fast when live).",
      "Soccer lists the home team first; US leagues away-first.",
    ],
  },
  {
    v: "0.3–0.4",
    notes: [
      "On-device self-updating digital clock, scrolling marquee, Newton's cradle (synced across all 5 screens), image upload, solid colour.",
      "Verify connection, friendly status messages, and a LocalToken helper with annotated screenshots.",
    ],
  },
  { v: "0.2", notes: ["Hosted web app + local bridge; 5-screen targeting with live preview."] },
];

async function framesToB64(canvases: HTMLCanvasElement[], quality?: number): Promise<string[]> {
  return Promise.all(canvases.map((c) => canvasToJpegBase64(c, quality)));
}

function describeScreens(screens: number[]): string {
  if (screens.length === SCREEN_COUNT) return "all screens";
  if (screens.length > 1) return `screens ${screens.map((s) => s + 1).join(", ")}`;
  if (screens.length === 1) return `screen ${screens[0] + 1}`;
  return "no screens";
}

async function sportsCommands(screens: HTMLCanvasElement[]): Promise<Command[]> {
  resetPicIdCounter();
  const packets: Command[] = [];
  for (let i = 0; i < SCREEN_COUNT; i++) {
    const b64 = await canvasToJpegBase64(screens[i]);
    packets.push(
      sendHttpGifFrame({
        mask: lcdMask(i), picNum: 1, picOffset: 0, picId: nextPicId(), picSpeed: 1000, picData: b64,
      }),
    );
  }
  return [resetHttpGifId(), commandList(packets)];
}

/** Labelled colour swatch (native input; Radix has no colour picker). */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <Text size="1" color="gray">{label}</Text>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="color" />
    </label>
  );
}

function Msg({ m }: { m: Friendly }) {
  return (
    <Callout.Root color={m.ok ? "green" : "amber"} size="1" mt="2">
      <Callout.Text>{m.msg}</Callout.Text>
    </Callout.Root>
  );
}

export default function App() {
  const [cfg, setCfg] = useState<Config>(loadConfig());
  const [bridge, setBridge] = useState<BridgeStatus>({ ok: false, error: "not checked" });
  const [screens, setScreens] = useState<number[]>([0]);
  const [template, setTemplate] = useState<TemplateId>("digital");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Friendly | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<Friendly | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [solidColor, setSolidColor] = useState("#00C8FF");
  const [textValue, setTextValue] = useState("HELLO TIMES GATE");
  const [textColor, setTextColor] = useState("#00E5FF");
  const [textBg, setTextBg] = useState<BgPreset>("dark");
  const [seconds, setSeconds] = useState(true);
  const [imageCanvas, setImageCanvas] = useState<HTMLCanvasElement | null>(null);
  const [clockBig, setClockBig] = useState(true);
  const [clockX, setClockX] = useState(39);
  const [clockY, setClockY] = useState(32);
  const [clockBg, setClockBg] = useState<BgPreset>("dark");
  const [cradleRandom, setCradleRandom] = useState(false);
  const [league, setLeague] = useState<string>(() => localStorage.getItem("pixelgate.league") || "nfl");
  const [favTeam, setFavTeam] = useState<string>(() => loadFav(localStorage.getItem("pixelgate.league") || "nfl"));
  const [game, setGame] = useState<Game | null>(null);
  const [scoreScreens, setScoreScreens] = useState<HTMLCanvasElement[]>([]);
  const [scoreStatus, setScoreStatus] = useState<Friendly | null>(null);
  const [scoreAuto, setScoreAuto] = useState(false);
  // flight tracker
  const [flightProvider, setFlightProvider] = useState<ProviderId>(
    () => (localStorage.getItem("pixelgate.flightProvider") as ProviderId) || "aviationstack",
  );
  const [flightKeys, setFlightKeys] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem("pixelgate.flightKeys");
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    const legacy = localStorage.getItem("pixelgate.asKey"); // migrate old single key
    return legacy ? { aviationstack: legacy } : {};
  });
  const asKey = flightKeys[flightProvider] || "";
  const [flightCode, setFlightCode] = useState<string>(() => localStorage.getItem("pixelgate.flight") || "");
  const [flight, setFlight] = useState<FlightInfo | null>(null);
  const [flightScreens, setFlightScreens] = useState<HTMLCanvasElement[]>([]);
  const [flightStatus, setFlightStatus] = useState<Friendly | null>(null);
  const [flightAuto, setFlightAuto] = useState(false);

  // weather widget
  const [weatherCity, setWeatherCity] = useState<string>(() => localStorage.getItem("pixelgate.weatherCity") || "");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherCanvas, setWeatherCanvas] = useState<HTMLCanvasElement | null>(null);
  const [weatherSpread, setWeatherSpread] = useState<HTMLCanvasElement[]>([]);
  const [weatherLayout, setWeatherLayout] = useState<"single" | "spread">(
    () => (localStorage.getItem("pixelgate.weatherLayout") as "single" | "spread") || "single",
  );
  const [weatherStatus, setWeatherStatus] = useState<Friendly | null>(null);

  // quote of the day
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<Friendly | null>(null);

  // visual effects
  const [rainSpans, setRainSpans] = useState<"single" | "all">("all");
  const [rainSpeed, setRainSpeed] = useState(0.55);
  const [crawlSpans, setCrawlSpans] = useState<"single" | "all">("all");
  const [crawlTitle, setCrawlTitle] = useState("A long time ago");
  const [crawlText, setCrawlText] = useState(
    "In a galaxy far, far away, five little screens sat upon a desk, waiting to display something wonderful.",
  );
  const [crawlSpeed, setCrawlSpeed] = useState(1.1);
  const [crawlLoops, setCrawlLoops] = useState(0); // 0 = forever
  const [starSpeed, setStarSpeed] = useState(220); // timesteps to cross all 5
  const [starLoop, setStarLoop] = useState(true);
  const [effectPreview, setEffectPreview] = useState<HTMLCanvasElement[]>([]);
  const [effectRunning, setEffectRunning] = useState(false);
  const effectStop = useRef<null | (() => void)>(null);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const stripRef = useRef<HTMLCanvasElement>(null);
  const prevTemplate = useRef<TemplateId>("digital");
  const lastGood = useRef<Command[] | null>(null); // last non-flight push, for revert
  const flightRef = useRef<FlightInfo | null>(null); // latest flight, read in loops
  const lastFetchRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const persist = (next: Config) => {
    setCfg(next);
    saveConfig(next);
  };

  const checkBridge = useCallback(async () => {
    setBridge(await detectBridge(cfg.bridgePort));
  }, [cfg.bridgePort]);

  useEffect(() => {
    checkBridge();
  }, [checkBridge]);

  const chooseLeague = (lg: string) => {
    setLeague(lg);
    localStorage.setItem("pixelgate.league", lg);
    setFavTeam(loadFav(lg));
  };
  const chooseTeam = (id: string) => {
    setFavTeam(id);
    localStorage.setItem(`pixelgate.fav.${league}`, id);
  };
  const selectTemplate = (id: TemplateId) => {
    if (id === "flight" && template !== "flight") prevTemplate.current = template;
    setTemplate(id);
  };
  const setKey = (v: string) => {
    setFlightKeys((m) => {
      const next = { ...m, [flightProvider]: v };
      localStorage.setItem("pixelgate.flightKeys", JSON.stringify(next));
      return next;
    });
  };
  const chooseProvider = (v: string) => {
    setFlightProvider(v as ProviderId);
    localStorage.setItem("pixelgate.flightProvider", v);
    setFlight(null);
    setFlightScreens([]);
    setFlightStatus(null);
  };
  const setCode = (v: string) => {
    const u = v.toUpperCase();
    setFlightCode(u);
    localStorage.setItem("pixelgate.flight", u);
  };
  const setCity = (v: string) => {
    setWeatherCity(v);
    localStorage.setItem("pixelgate.weatherCity", v);
  };

  const refreshScores = useCallback(async () => {
    setScoreStatus(null);
    try {
      const lg = LEAGUES[league];
      const g = await fetchTeamGame(lg.path, favTeam);
      if (!g) {
        setGame(null);
        setScoreScreens([]);
        setScoreStatus({ ok: false, msg: "No game data for that team right now." });
        return;
      }
      setGame(g);
      setScoreScreens(await renderScreens(g, lg));
    } catch {
      setScoreStatus({ ok: false, msg: "Couldn't reach ESPN — try again." });
    }
  }, [league, favTeam]);

  useEffect(() => {
    if (template === "scores") {
      setScreens([0, 1, 2, 3, 4]);
      refreshScores();
    }
  }, [template, league, favTeam, refreshScores]);

  useEffect(() => {
    const cv = stripRef.current;
    if (!cv) return;
    const g = cv.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#000";
    g.fillRect(0, 0, cv.width, cv.height);
    const eff = EFFECT_IDS.includes(template);
    const effAllLocal =
      template === "starship" ||
      (template === "rain" && rainSpans === "all") ||
      (template === "crawl" && crawlSpans === "all");
    const strip = template === "flight" ? flightScreens
      : template === "weather" ? weatherSpread
      : eff && effAllLocal ? effectPreview
      : scoreScreens;
    strip.forEach((s, i) => s && g.drawImage(s, i * 128, 0));
  }, [scoreScreens, flightScreens, weatherSpread, weatherLayout, effectPreview, template, rainSpans, crawlSpans]);

  useEffect(() => {
    flightRef.current = flight;
  }, [flight]);

  const budgetNote = () => `${callsRemaining(flightProvider)}/${budgetOf(flightProvider)} API left`;

  // Manual "Track": dedupe repeat clicks within 5 min (serve cached, no API call),
  // guard the monthly budget, then fetch.
  const refreshFlight = useCallback(async () => {
    setFlightStatus(null);
    if (!asKey) return setFlightStatus({ ok: false, msg: `Enter your ${providerMeta(flightProvider).name} API key first.` });
    if (!flightCode) return setFlightStatus({ ok: false, msg: "Enter a flight number (e.g. DL903)." });
    const lf = lastFetchRef.current;
    const cached = flightRef.current;
    if (cached && lf.code === flightCode && Date.now() - lf.at < 5 * 60_000) {
      setFlightScreens(await renderFlightScreens(cached));
      setFlightStatus({ ok: true, msg: `Using cached (${Math.round((Date.now() - lf.at) / 1000)}s ago) · ${budgetNote()}` });
      return;
    }
    if (callsRemaining(flightProvider) <= 0)
      return setFlightStatus({ ok: false, msg: `Monthly API limit reached (${budgetOf(flightProvider)}). Resets next month.` });
    try {
      const f = await fetchFlight(flightProvider, asKey, flightCode);
      if (!f) {
        setFlight(null);
        setFlightScreens([]);
        setFlightStatus({ ok: false, msg: `Flight not found (real-time only). ${budgetNote()}` });
        return;
      }
      lastFetchRef.current = { code: flightCode, at: Date.now() };
      setFlight(f);
      setFlightScreens(await renderFlightScreens(f));
      setFlightStatus({ ok: true, msg: `${f.dep.iata} → ${f.arr.iata} · ${f.status} · ${budgetNote()}` });
    } catch (e) {
      setFlightStatus({ ok: false, msg: (e as Error).message });
    }
  }, [flightProvider, asKey, flightCode]);

  useEffect(() => {
    if (template === "flight") {
      setScreens([0, 1, 2, 3, 4]);
      if (asKey && flightCode) refreshFlight();
    }
  }, [template, refreshFlight, asKey, flightCode]);

  // Weather: geocode the city + fetch current conditions, render a frame.
  const refreshWeather = useCallback(async () => {
    setWeatherStatus(null);
    if (!weatherCity.trim()) return setWeatherStatus({ ok: false, msg: "Enter a city name first." });
    try {
      const w = await fetchWeather(weatherCity);
      if (!w) {
        setWeather(null);
        setWeatherCanvas(null);
        return setWeatherStatus({ ok: false, msg: `Couldn't find "${weatherCity}". Try a different spelling.` });
      }
      setWeather(w);
      setWeatherCanvas(renderWeather(w));
      setWeatherSpread(renderWeatherSpread(w));
      setWeatherStatus({ ok: true, msg: `${w.city}: ${w.tempF}°F / ${w.tempC}°C · ${w.desc}` });
    } catch (e) {
      setWeatherStatus({ ok: false, msg: (e as Error).message });
    }
  }, [weatherCity]);

  useEffect(() => {
    if (template !== "weather") return;
    if (weatherLayout === "spread") setScreens([0, 1, 2, 3, 4]); // spread always uses all 5
    if (weatherCity.trim()) refreshWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, weatherLayout]);

  // Quote of the day — fetched once (changes daily); no fast polling.
  const refreshQuote = useCallback(async () => {
    setQuoteStatus(null);
    try {
      const q = await fetchQuote();
      if (!q) {
        setQuote(null);
        return setQuoteStatus({ ok: false, msg: "Couldn't load today's quote — try again shortly." });
      }
      setQuote(q);
      setQuoteStatus({ ok: true, msg: `“${q.text.slice(0, 40)}${q.text.length > 40 ? "…" : ""}” — ${q.author}` });
    } catch (e) {
      setQuoteStatus({ ok: false, msg: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    if (template === "quote" && !quote) refreshQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  // ---- visual effects ----------------------------------------------------
  // Build a fresh effect generator from the current template + options.
  const makeRunner = useCallback((): Effect => {
    if (template === "rain") return createRain({ spans: rainSpans, speed: rainSpeed });
    if (template === "crawl")
      return createCrawl({ spans: crawlSpans, title: crawlTitle, text: crawlText, speed: crawlSpeed, loops: crawlLoops });
    return createStarship({ speed: starSpeed, loop: starLoop });
  }, [template, rainSpans, rainSpeed, crawlSpans, crawlTitle, crawlText, crawlSpeed, crawlLoops, starSpeed, starLoop]);

  // A static preview frame (a representative moment mid-animation).
  useEffect(() => {
    if (!EFFECT_IDS.includes(template)) return;
    const runner = makeRunner();
    let row: HTMLCanvasElement[] | undefined;
    if (runner.mode === "loop") {
      const frames = runner.nextBatch(runner.loopLen);
      const frac = template === "starship" ? 0.5 : template === "crawl" ? 0.5 : 0.27;
      const idx = Math.floor(runner.loopLen * frac);
      row = frames[Math.min(idx, frames.length - 1)] ?? frames[0];
    } else {
      runner.nextBatch(28); // warm a stream effect so content is on screen
      row = runner.nextBatch(1)[0];
    }
    if (row) setEffectPreview(row);
  }, [template, makeRunner]);

  // Turn a batch of timesteps into device commands (one on-device animation the
  // device plays smoothly; all-screen effects go in one atomic CommandList).
  const batchToCommands = useCallback(
    async (batch: HTMLCanvasElement[][], spans: "single" | "all", effScreens: number[], picSpeed: number): Promise<Command[]> => {
      const B = batch.length;
      if (!B) return [];
      // Effect frames (noisy rain / starfield) compress poorly at high quality and
      // a 5-screen loop is a lot of frames in one push, so encode leaner to keep the
      // CommandList payload well under the device's limit.
      const EFFECT_Q = 0.55;
      if (spans === "all") {
        const packets: Command[] = [];
        for (let s = 0; s < SCREEN_COUNT; s++) {
          const frames = batch.map((row) => row[s]);
          const b64 = await framesToB64(frames, EFFECT_Q);
          const pid = nextPicId();
          b64.forEach((data, off) =>
            packets.push(sendHttpGifFrame({ mask: lcdMask(s), picNum: B, picOffset: off, picId: pid, picSpeed, picData: data })),
          );
        }
        return [commandList(packets)];
      }
      const frames = batch.map((row) => row[0]);
      const b64 = await framesToB64(frames, EFFECT_Q);
      return buildAnimation(effScreens, b64, picSpeed);
    },
    [],
  );

  const revertLastGood = useCallback(() => {
    if (bridge.ok && cfg.deviceIp && lastGood.current) {
      const restore = lastGood.current.map((c) => ({ ...c, LocalToken: Number(cfg.localToken) }));
      pushSequence(cfg.bridgePort, cfg.deviceIp, restore).catch(() => {});
    }
  }, [bridge.ok, cfg]);

  const stopEffect = useCallback((revert: boolean) => {
    effectStop.current?.();
    effectStop.current = null;
    setEffectRunning(false);
    setReply({ ok: true, msg: revert ? "Stopped — reverted to your previous display." : "Stopped." });
    if (revert) revertLastGood();
  }, [revertLastGood]);

  const startEffect = useCallback(async () => {
    setReply(null);
    setScript(null);
    if (!cfg.deviceIp || !cfg.localToken)
      return setReply({ ok: false, msg: "Enter your device IP + LocalToken first." });
    if (!bridge.ok)
      return setReply({ ok: false, msg: "Start the local bridge to run live effects." });
    effectStop.current?.();
    const runner = makeRunner();
    const spans = runner.spans;
    const effScreens = spans === "all" ? [0, 1, 2, 3, 4] : screens.length ? screens : [0];
    const token = Number(cfg.localToken);
    const push = (cmds: Command[]) =>
      pushSequence(cfg.bridgePort, cfg.deviceIp, cmds.map((c) => ({ ...c, LocalToken: token })));
    resetPicIdCounter();
    setEffectRunning(true);
    setReply({ ok: true, msg: `Playing ${TEMPLATE_LABEL[template]}… press Stop to end.` });

    if (runner.mode === "loop") {
      // Push ONE self-contained loop and let the device loop it natively — no
      // ongoing stream, so nothing rewinds. (rain, starship)
      try {
        const batch = runner.nextBatch(runner.loopLen);
        const cmds = await batchToCommands(batch, spans, effScreens, runner.picSpeed);
        await push([resetHttpGifId()]);
        await push(cmds);
      } catch {
        setEffectRunning(false);
        return setReply({ ok: false, msg: "Couldn't start the effect — is the bridge still running?" });
      }
      if (runner.loopForever) {
        // Nothing to tick; the device loops. Stop = revert.
        effectStop.current = () => {};
      } else {
        // Play `runCount` passes, then revert to the previous display.
        const t = window.setTimeout(() => {
          effectStop.current = null;
          setEffectRunning(false);
          setReply({ ok: true, msg: "Effect finished. ▸ reverted to your previous display." });
          revertLastGood();
        }, runner.loopLen * runner.picSpeed * Math.max(1, runner.runCount) + 500);
        effectStop.current = () => clearTimeout(t);
      }
      return;
    }

    // Stream mode: push ONE static frame per tick (PicNum=1), so there is no
    // on-device animation to rewind. (opening crawl)
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      if (stopped) return;
      try {
        const batch = runner.nextBatch(1);
        if (batch.length) await push(await batchToCommands(batch, spans, effScreens, runner.picSpeed));
      } catch { /* transient — keep going */ }
      if (stopped) return;
      if (runner.done) {
        effectStop.current = null;
        setEffectRunning(false);
        setReply({ ok: true, msg: "Effect finished. ▸ reverted to your previous display." });
        window.setTimeout(revertLastGood, 500);
        return;
      }
      timer = window.setTimeout(tick, runner.picSpeed);
    };
    effectStop.current = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    try {
      await push([resetHttpGifId()]);
    } catch { /* ignore */ }
    tick();
  }, [cfg, bridge.ok, makeRunner, screens, template, batchToCommands, revertLastGood]);

  // Stop any running effect when the template changes or the component unmounts.
  useEffect(() => {
    return () => {
      effectStop.current?.();
      effectStop.current = null;
      setEffectRunning(false);
    };
  }, [template]);

  const buildPreview = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    switch (template) {
      case "solid":
        return renderSolid(solidColor);
      case "digital":
        return renderDigital(new Date(), { bg: BG_PRESET_HEX[clockBg], color: textColor, seconds });
      case "ball":
        return renderNewtonsCradle(40)[0];
      case "image":
        return imageCanvas;
      case "text":
        return renderText(textValue, textColor, BG_PRESET_HEX[textBg]);
      case "weather":
        return weatherLayout === "spread" ? null : weatherCanvas;
      case "quote":
        return quote
          ? renderWrapped(`“${quote.text}”`, { footer: `— ${quote.author}`, maxFont: 17, footerColor: "#FFD227" })
          : renderWrapped("Loading today's quote…", { color: "#9AA4BD" });
      case "rain":
        return rainSpans === "all" ? null : effectPreview[0] ?? null;
      case "crawl":
        return crawlSpans === "all" ? null : effectPreview[0] ?? null;
      case "starship":
        return null; // always spans all 5 -> shown in the strip preview
      case "scores":
      case "flight":
        return null;
    }
  }, [template, solidColor, textColor, textValue, seconds, imageCanvas, clockBg, textBg, weatherCanvas, weatherLayout, quote, effectPreview, rainSpans, crawlSpans]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await buildPreview();
      if (cancelled || !c || !previewRef.current) return;
      const g = previewRef.current.getContext("2d")!;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, 128, 128);
      g.drawImage(c, 0, 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [buildPreview]);

  const buildCommands = useCallback(async (): Promise<Command[]> => {
    if (template === "digital") {
      return buildDigitalClock(screens, {
        color: textColor, big: clockBig, stacked: seconds, x: clockX, y: clockY, bg: clockBg,
      });
    }
    if (template === "text") {
      return buildScrollingText(screens, { text: textValue, color: textColor, bg: textBg });
    }
    if (template === "quote") {
      const q = quote ?? (await fetchQuote());
      if (!q) throw new Error("no quote data — press Refresh");
      // On-device scrolling marquee of quote → author → attribution (always
      // included). Same text on each assigned screen. Scrolls natively, no re-push.
      return buildScrollingText(screens, {
        text: quoteMarquee(q),
        color: textColor,
        bg: textBg,
        maxLen: 240,
      });
    }
    if (template === "scores") {
      let sc = scoreScreens;
      if (sc.length !== SCREEN_COUNT) {
        const lg = LEAGUES[league];
        const g = game ?? (await fetchTeamGame(lg.path, favTeam));
        if (!g) throw new Error("no game data");
        sc = await renderScreens(g, lg);
      }
      return sportsCommands(sc);
    }
    if (template === "flight") {
      let sc = flightScreens;
      if (sc.length !== SCREEN_COUNT) {
        const f = flight ?? (await fetchFlight(flightProvider, asKey, flightCode));
        if (!f) throw new Error("no flight data");
        sc = await renderFlightScreens(f);
      }
      return sportsCommands(sc);
    }
    if (template === "weather" && weatherLayout === "spread") {
      let sc = weatherSpread;
      if (sc.length !== SCREEN_COUNT) {
        const w = weather ?? (await fetchWeather(weatherCity));
        if (!w) throw new Error("no weather data — enter a city and press Refresh");
        sc = renderWeatherSpread(w);
      }
      return sportsCommands(sc); // 5 distinct tiles, one per screen (atomic CommandList)
    }
    const cmds: Command[] = [resetHttpGifId()];
    resetPicIdCounter();
    if (template === "ball") {
      const numSwing = cradleRandom ? (Math.random() < 0.5 ? 1 : 2) : 1;
      if (screens.length === SCREEN_COUNT) {
        const FRAMES = 24;
        const packets: Command[] = [];
        for (let i = 0; i < SCREEN_COUNT; i++) {
          const b64 = await framesToB64(renderCradleScreen(i, FRAMES, { numSwing }));
          const mask = lcdMask(i);
          const picId = nextPicId();
          b64.forEach((data, off) =>
            packets.push(sendHttpGifFrame({ mask, picNum: b64.length, picOffset: off, picId, picSpeed: 60, picData: data })),
          );
        }
        cmds.push(commandList(packets));
      } else {
        const b64 = await framesToB64(renderNewtonsCradle(40, { numSwing }));
        cmds.push(...buildAnimation(screens, b64, 45));
      }
      return cmds;
    }
    let canvases: HTMLCanvasElement[];
    const speed = 1000;
    switch (template) {
      case "solid":
        canvases = [renderSolid(solidColor)];
        break;
      case "image":
        if (!imageCanvas) throw new Error("no image chosen");
        canvases = [imageCanvas];
        break;
      case "weather": {
        const wc = weatherCanvas ?? (weather ? renderWeather(weather) : null);
        if (!wc) throw new Error("no weather data — enter a city and press Refresh");
        canvases = [wc];
        break;
      }
      default:
        canvases = [renderSolid("#000000")];
    }
    const b64 = await framesToB64(canvases);
    cmds.push(...buildAnimation(screens, b64, speed));
    return cmds;
  }, [
    template, screens, solidColor, textColor, textValue, seconds,
    imageCanvas, clockBig, clockX, clockY, clockBg, textBg, cradleRandom,
    scoreScreens, game, league, favTeam,
    flightScreens, flight, flightProvider, asKey, flightCode,
    weatherCanvas, weather, weatherSpread, weatherLayout, weatherCity, quote,
  ]);

  useEffect(() => {
    if (!(scoreAuto && template === "scores" && bridge.ok && cfg.deviceIp && cfg.localToken)) return;
    let stopped = false;
    let timer: number | undefined;
    const lg = LEAGUES[league];
    const tick = async () => {
      if (stopped) return;
      try {
        const g = await fetchTeamGame(lg.path, favTeam);
        if (g) {
          const sc = await renderScreens(g, lg);
          setGame(g);
          setScoreScreens(sc);
          const cmds = (await sportsCommands(sc)).map((c) => ({ ...c, LocalToken: Number(cfg.localToken) }));
          await pushSequence(cfg.bridgePort, cfg.deviceIp, cmds);
          setScoreStatus({ ok: true, msg: `Updated ${new Date().toLocaleTimeString()} · ${g.state === "in" ? "LIVE" : g.state}` });
          if (!stopped) timer = window.setTimeout(tick, pollIntervalMs(g));
        } else if (!stopped) {
          timer = window.setTimeout(tick, 7 * 60_000);
        }
      } catch {
        if (!stopped) timer = window.setTimeout(tick, 30_000);
      }
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [scoreAuto, template, bridge.ok, cfg.deviceIp, cfg.localToken, cfg.bridgePort, league, favTeam]);

  // Flight tracker loop. The DISPLAY re-renders every minute from cached data
  // (recomputes the countdown — NO API call); the DATA is only re-fetched when
  // stale per dataRefreshMs (respecting the 100/month cap) or to confirm a
  // landing. On landed/cancelled, revert to the previously-shown widget.
  useEffect(() => {
    if (!(flightAuto && template === "flight" && bridge.ok && cfg.deviceIp && cfg.localToken && asKey && flightCode)) return;
    let stopped = false;
    let timer: number | undefined;
    let current = flightRef.current;
    let lastFetch = current ? lastFetchRef.current.at : 0;
    const push = async (canvases: HTMLCanvasElement[]) => {
      const cmds = (await sportsCommands(canvases)).map((c) => ({ ...c, LocalToken: Number(cfg.localToken) }));
      await pushSequence(cfg.bridgePort, cfg.deviceIp, cmds);
    };
    const tick = async () => {
      if (stopped) return;
      try {
        const due =
          current == null ||
          Date.now() - lastFetch >= dataRefreshMs(current) ||
          shouldConfirmLanding(current, lastFetch);
        if (due && callsRemaining(flightProvider) > 0) {
          const f = await fetchFlight(flightProvider, asKey, flightCode);
          if (f) {
            current = f;
            lastFetch = Date.now();
            lastFetchRef.current = { code: flightCode, at: lastFetch };
            setFlight(f);
          }
        }
        if (current) {
          const sc = await renderFlightScreens(current); // recomputes countdown locally
          setFlightScreens(sc);
          await push(sc);
          if (isOver(current)) {
            setFlightStatus({ ok: true, msg: `${current.status} — reverting to previous widget` });
            setFlightAuto(false);
            if (lastGood.current) {
              const restore = lastGood.current.map((c) => ({ ...c, LocalToken: Number(cfg.localToken) }));
              window.setTimeout(() => pushSequence(cfg.bridgePort, cfg.deviceIp, restore), 8000);
            }
            return;
          }
          setFlightStatus({ ok: true, msg: `${current.status} · ${callsRemaining(flightProvider)}/${budgetOf(flightProvider)} API left` });
        }
      } catch (e) {
        if (e instanceof BudgetError) {
          setFlightStatus({ ok: false, msg: e.message });
          setFlightAuto(false);
          return;
        }
        /* transient — try again next tick */
      }
      if (!stopped) timer = window.setTimeout(tick, DISPLAY_TICK_MS);
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [flightAuto, template, bridge.ok, cfg.deviceIp, cfg.localToken, cfg.bridgePort, flightProvider, asKey, flightCode]);

  const doPush = useCallback(async (): Promise<Friendly> => {
    const cmds = await buildCommands();
    if (!bridge.ok) {
      setScript(generateScript(cfg.deviceIp, Number(cfg.localToken), cmds));
      return {
        ok: false,
        msg: "The local bridge isn't running, so I can't push live. Copy the script below and run it, or start the bridge and try again.",
      };
    }
    const withToken = cmds.map((c) => ({ ...c, LocalToken: Number(cfg.localToken) }));
    const r = await pushSequence(cfg.bridgePort, cfg.deviceIp, withToken);
    if (template !== "flight") lastGood.current = cmds; // remember for flight revert
    return friendly(r, `Sent — ${describeScreens(screens)} updated. ✓`);
  }, [cfg, bridge, buildCommands, screens, template]);

  const send = useCallback(async () => {
    setReply(null);
    setScript(null);
    if (!cfg.deviceIp) return setReply({ ok: false, msg: "Enter your device IP first (or click Discover)." });
    if (!cfg.localToken)
      return setReply({ ok: false, msg: 'Enter your LocalToken first — see "Where do I find my LocalToken?"' });
    setBusy(true);
    try {
      setReply(await doPush());
    } catch {
      setReply({ ok: false, msg: "Couldn't reach the local bridge — make sure it's running on your machine." });
    } finally {
      setBusy(false);
    }
  }, [cfg, doPush]);

  const verify = useCallback(async () => {
    setVerifyMsg(null);
    if (!cfg.deviceIp) return setVerifyMsg({ ok: false, msg: "Enter your device IP first." });
    if (!cfg.localToken) return setVerifyMsg({ ok: false, msg: "Enter your LocalToken first." });
    if (!bridge.ok) return setVerifyMsg({ ok: false, msg: "Start the local bridge first, then verify." });
    setVerifying(true);
    try {
      setVerifyMsg(await verifyConnection(cfg.bridgePort, cfg.deviceIp, Number(cfg.localToken)));
    } finally {
      setVerifying(false);
    }
  }, [cfg, bridge]);

  const toggleScreen = (i: number) =>
    setScreens((prev) => (prev.includes(i) ? prev.filter((s) => s !== i) : [...prev, i].sort()));

  const runDiscover = async () => {
    setVerifyMsg(null);
    if (!bridge.ok) return setVerifyMsg({ ok: false, msg: "Start the local bridge first, then Discover." });
    try {
      const d = (await discover(cfg.bridgePort)) as { DeviceList?: { DevicePrivateIP: string; DeviceName: string }[] };
      const found = d.DeviceList?.[0];
      if (found) {
        persist({ ...cfg, deviceIp: found.DevicePrivateIP });
        setVerifyMsg({ ok: true, msg: `Found "${found.DeviceName}" at ${found.DevicePrivateIP}. ✓` });
      } else {
        setVerifyMsg({ ok: false, msg: "No Times Gate found on this network." });
      }
    } catch {
      setVerifyMsg({ ok: false, msg: "Discover failed — is the local bridge running?" });
    }
  };

  const isScores = template === "scores";
  const isFlight = template === "flight";
  const isWeather = template === "weather";
  const isQuote = template === "quote";
  const weatherIsSpread = isWeather && weatherLayout === "spread";
  const isEffect = EFFECT_IDS.includes(template);
  const effAll =
    template === "starship" ||
    (template === "rain" && rainSpans === "all") ||
    (template === "crawl" && crawlSpans === "all");
  const isStrip = isScores || isFlight || weatherIsSpread || (isEffect && effAll);
  const bgSelect = (value: BgPreset, onChange: (v: BgPreset) => void) => (
    <Select.Root value={value} onValueChange={(v) => onChange(v as BgPreset)}>
      <Select.Trigger />
      <Select.Content>
        {BG_PRESETS.map((p) => (
          <Select.Item key={p} value={p}>
            {p[0].toUpperCase() + p.slice(1)}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );

  return (
    <Container size="2" px="4" py="5">
      <Flex direction="column" gap="4">
        <Box>
          <Flex align="center" gap="2">
            <Heading size="7">PixelGate</Heading>
            <Badge color="pink" variant="soft" radius="full">unofficial</Badge>
          </Flex>
          <Text size="2" color="gray">
            Design and push visuals to a{" "}
            <Link href="https://divoom.com/products/time-gate" target="_blank" rel="noopener noreferrer">
              Divoom Times Gate
            </Link>
            . Not affiliated with Divoom — use at your own risk. v{APP_VERSION}
          </Text>
        </Box>

        {/* 1. Connect */}
        <Card size="2">
          <Heading size="3" mb="3">1 · Connect</Heading>
          <Grid columns={{ initial: "1", xs: "3" }} gap="3" mb="3">
            <label className="field">
              <Text size="1" color="gray">Device IP</Text>
              <TextField.Root value={cfg.deviceIp} placeholder="192.168.x.x"
                onChange={(e) => persist({ ...cfg, deviceIp: e.target.value })} />
            </label>
            <label className="field">
              <Text size="1" color="gray">LocalToken</Text>
              <TextField.Root value={cfg.localToken} placeholder="from Divoom app"
                onChange={(e) => persist({ ...cfg, localToken: e.target.value })} />
            </label>
            <label className="field">
              <Text size="1" color="gray">Bridge port</Text>
              <TextField.Root type="number" value={String(cfg.bridgePort)}
                onChange={(e) => persist({ ...cfg, bridgePort: Number(e.target.value) || 7660 })} />
            </label>
          </Grid>
          <Flex gap="2" align="center" wrap="wrap">
            <Button variant="soft" onClick={checkBridge}>Check bridge</Button>
            <Button variant="soft" onClick={runDiscover}>Discover device</Button>
            <Button variant="outline" onClick={verify} disabled={verifying}>
              {verifying ? "Verifying…" : "Verify connection"}
            </Button>
            <Badge color={bridge.ok ? "green" : "gray"} variant="soft">
              {bridge.ok ? `bridge up (v${bridge.version})` : "bridge not detected"}
            </Badge>
          </Flex>
          {verifyMsg && <Msg m={verifyMsg} />}
          <Box mt="2">
            <Link href="#" onClick={(e) => { e.preventDefault(); setShowHelp((v) => !v); }}>
              {showHelp ? "Hide help" : "Where do I find my LocalToken?"}
            </Link>
          </Box>
          {showHelp && (
            <Box mt="3">
              <Text size="2" color="gray">
                The LocalToken is a short number in the Divoom phone app. Follow these three steps, then paste it above.
              </Text>
              <Grid columns={{ initial: "1", xs: "3" }} gap="3" mt="2">
                {[
                  { n: 1, img: "step1.jpg", cap: "Tap your Times Gate device" },
                  { n: 2, img: "step2.jpg", cap: "Open its Settings" },
                  { n: 3, img: "step3.jpg", cap: "Copy the Local Token" },
                ].map((s) => (
                  <Box key={s.n}>
                    <img src={`${import.meta.env.BASE_URL}onboarding/${s.img}`} alt={s.cap} className="help-img" />
                    <Text size="1" color="gray" align="center" as="div" mt="1">{s.n}. {s.cap}</Text>
                  </Box>
                ))}
              </Grid>
            </Box>
          )}
        </Card>

        {/* 2. Screens */}
        <Card size="2">
          <Heading size="3" mb="3">2 · Screens</Heading>
          <Flex gap="2" wrap="wrap">
            {Array.from({ length: SCREEN_COUNT }, (_, i) => (
              <Button key={i} variant={screens.includes(i) ? "solid" : "surface"} onClick={() => toggleScreen(i)}
                style={{ width: 44 }}>
                {i + 1}
              </Button>
            ))}
            <Button variant="soft" onClick={() => setScreens([0, 1, 2, 3, 4])}>All</Button>
          </Flex>
        </Card>

        {/* 3. Display */}
        <Card size="2">
          <Heading size="3" mb="3">3 · Display</Heading>
          <Flex direction="column" gap="3">
            {GROUPS.map((grp) => (
              <Box key={grp.label}>
                <Text size="1" color="gray" weight="medium" as="div" mb="1">{grp.label}</Text>
                <Flex gap="2" wrap="wrap">
                  {grp.items.map((id) => (
                    <Button key={id} variant={template === id ? "solid" : "surface"} onClick={() => selectTemplate(id)}>
                      {TEMPLATE_LABEL[id]}
                    </Button>
                  ))}
                </Flex>
              </Box>
            ))}
          </Flex>

          <Separator size="4" my="3" />

          <Flex gap="4" align="end" wrap="wrap">
            {template === "solid" && <ColorField label="Colour" value={solidColor} onChange={setSolidColor} />}

            {template === "digital" && (
              <>
                <ColorField label="Colour" value={textColor} onChange={setTextColor} />
                <label className="field"><Text size="1" color="gray">Background</Text>{bgSelect(clockBg, setClockBg)}</label>
                <label className="field">
                  <Text size="1" color="gray">Size</Text>
                  <Select.Root value={clockBig ? "large" : "small"} onValueChange={(v) => setClockBig(v === "large")}>
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="large">Large</Select.Item>
                      <Select.Item value="small">Small</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </label>
                <Text as="label" size="2"><Flex gap="2" align="center"><Switch checked={seconds} onCheckedChange={setSeconds} />seconds (stacked)</Flex></Text>
                <label className="field" style={{ minWidth: 150 }}>
                  <Text size="1" color="gray">X · {clockX}</Text>
                  <Slider value={[clockX]} min={0} max={100} onValueChange={(v) => setClockX(v[0])} />
                </label>
                <label className="field" style={{ minWidth: 150 }}>
                  <Text size="1" color="gray">Y · {clockY}</Text>
                  <Slider value={[clockY]} min={0} max={100} onValueChange={(v) => setClockY(v[0])} />
                </label>
              </>
            )}

            {template === "text" && (
              <>
                <label className="field" style={{ flex: 1, minWidth: 220 }}>
                  <Text size="1" color="gray">Message</Text>
                  <TextField.Root value={textValue} onChange={(e) => setTextValue(e.target.value)} />
                </label>
                <ColorField label="Colour" value={textColor} onChange={setTextColor} />
                <label className="field"><Text size="1" color="gray">Background</Text>{bgSelect(textBg, setTextBg)}</label>
              </>
            )}

            {template === "image" && (
              <label className="field">
                <Text size="1" color="gray">Image file</Text>
                <input type="file" accept="image/*" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setImageCanvas(await imageFileToCanvas(f));
                }} />
              </label>
            )}

            {template === "ball" && (
              <>
                <Text as="label" size="2"><Flex gap="2" align="center"><Switch checked={cradleRandom} onCheckedChange={setCradleRandom} />randomize spheres</Flex></Text>
                <Text size="1" color="gray">Pick <b>All</b> screens for one sphere per screen — a cradle across the device.</Text>
              </>
            )}

            {isScores && (
              <>
                <label className="field">
                  <Text size="1" color="gray">League</Text>
                  <Select.Root value={league} onValueChange={chooseLeague}>
                    <Select.Trigger />
                    <Select.Content>
                      {["US", "Soccer"].map((grp) => (
                        <Select.Group key={grp}>
                          <Select.Label>{grp}</Select.Label>
                          {Object.values(LEAGUES).filter((l) => l.group === grp).map((l) => (
                            <Select.Item key={l.id} value={l.id}>{l.name}</Select.Item>
                          ))}
                        </Select.Group>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </label>
                <label className="field" style={{ minWidth: 200 }}>
                  <Text size="1" color="gray">Team</Text>
                  <Select.Root value={favTeam} onValueChange={chooseTeam}>
                    <Select.Trigger />
                    <Select.Content>
                      {LEAGUES[league].teams.map((t) => (
                        <Select.Item key={t.id} value={t.id}>{t.name}</Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </label>
                <Button variant="soft" onClick={refreshScores}>Refresh</Button>
                <Text as="label" size="2"><Flex gap="2" align="center"><Switch checked={scoreAuto} onCheckedChange={setScoreAuto} />auto-update</Flex></Text>
                {game && (
                  <Badge color="gray" variant="soft">
                    {homeFirst(LEAGUES[league]) ? `${game.home.abbr} v ${game.away.abbr}` : `${game.away.abbr} @ ${game.home.abbr}`}
                    {" · "}{game.state === "pre" ? "upcoming" : game.state === "in" ? "LIVE" : "final"}
                  </Badge>
                )}
                {scoreStatus && (
                  <Text size="1" color={scoreStatus.ok ? "green" : "amber"}>{scoreStatus.msg}</Text>
                )}
              </>
            )}

            {isFlight && (() => {
              const pm = providerMeta(flightProvider);
              const remaining = callsRemaining(flightProvider);
              return (
              <>
                <label className="field">
                  <Text size="1" color="gray">Data provider</Text>
                  <Select.Root value={flightProvider} onValueChange={chooseProvider}>
                    <Select.Trigger />
                    <Select.Content>
                      {Object.values(PROVIDERS).map((p) => (
                        <Select.Item key={p.id} value={p.id}>{p.name}</Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </label>
                <label className="field" style={{ minWidth: 220 }}>
                  <Text size="1" color="gray">
                    {pm.keyLabel}{" "}
                    <Link href={pm.signupUrl} target="_blank" rel="noopener noreferrer" size="1">
                      (get a free key)
                    </Link>
                  </Text>
                  <TextField.Root type="password" value={asKey} placeholder={pm.keyHint}
                    onChange={(e) => setKey(e.target.value)} />
                </label>
                <label className="field">
                  <Text size="1" color="gray">Flight number</Text>
                  <TextField.Root value={flightCode} placeholder="e.g. DL903"
                    onChange={(e) => setCode(e.target.value)} />
                </label>
                <Button variant="soft" onClick={refreshFlight}>Track</Button>
                <Text as="label" size="2" title={`Keeps the on-device countdown live: re-renders every minute from cached data (no API call), and only re-checks ${pm.name} every ~30 min while active/near (slower far out) to respect the ${pm.monthlyBudget}/month free cap. Reverts to your previous widget when the flight lands or is cancelled.`}>
                  <Flex gap="2" align="center"><Switch checked={flightAuto} onCheckedChange={setFlightAuto} />auto-update</Flex>
                </Text>
                {flight && (
                  <Badge color="gray" variant="soft">{flight.dep.iata} → {flight.arr.iata} · {flight.status}</Badge>
                )}
                <Badge color={remaining > 10 ? "green" : remaining > 0 ? "amber" : "red"} variant="soft">
                  API {remaining}/{pm.monthlyBudget} left
                </Badge>
                {flightStatus && (
                  <Text size="1" color={flightStatus.ok ? "green" : "amber"}>{flightStatus.msg}</Text>
                )}
                <Box style={{ flexBasis: "100%" }}>
                  <details className="faq-item">
                    <summary>How to get your {pm.name} key</summary>
                    <ol className="changes" style={{ marginTop: 6 }}>
                      {pm.steps.map((s, i) => (
                        <li key={i}><Text size="1" color="gray">{s}</Text></li>
                      ))}
                    </ol>
                  </details>
                </Box>
                <Text size="1" color="gray" style={{ flexBasis: "100%" }}>
                  {pm.note} The live countdown ticks locally (no calls); data re-checks ~every 30 min
                  while active. Your key stays in your browser.
                </Text>
              </>
              );
            })()}

            {isWeather && (
              <>
                <label className="field" style={{ minWidth: 200 }}>
                  <Text size="1" color="gray">City</Text>
                  <TextField.Root value={weatherCity} placeholder="e.g. Seattle"
                    onChange={(e) => setCity(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") refreshWeather(); }} />
                </label>
                <label className="field">
                  <Text size="1" color="gray">Layout</Text>
                  <Select.Root
                    value={weatherLayout}
                    onValueChange={(v) => {
                      setWeatherLayout(v as "single" | "spread");
                      localStorage.setItem("pixelgate.weatherLayout", v);
                      if (v === "spread") setScreens([0, 1, 2, 3, 4]);
                    }}
                  >
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="single">Single tile</Select.Item>
                      <Select.Item value="spread">Spread across 5</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </label>
                <Button variant="soft" onClick={refreshWeather}>Refresh</Button>
                {weather && (
                  <Badge color="gray" variant="soft">
                    {weather.city} · {weather.tempF}°F / {weather.tempC}°C · {weather.desc}
                  </Badge>
                )}
                {weatherStatus && (
                  <Text size="1" color={weatherStatus.ok ? "green" : "amber"}>{weatherStatus.msg}</Text>
                )}
                <Text size="1" color="gray" style={{ flexBasis: "100%" }}>
                  Live conditions from Open-Meteo (no API key). Pick screens above, then Send.
                  Shows current temperature in both °F and °C plus today's high / low.
                </Text>
              </>
            )}

            {isQuote && (
              <>
                <Button variant="soft" onClick={refreshQuote}>Refresh quote</Button>
                {quote && (
                  <Badge color="gray" variant="soft" style={{ maxWidth: 420, whiteSpace: "normal", height: "auto" }}>
                    “{quote.text}” — {quote.author}
                  </Badge>
                )}
                {quoteStatus && (
                  <Text size="1" color={quoteStatus.ok ? "green" : "amber"}>{quoteStatus.msg}</Text>
                )}
                <Text size="1" color="gray" style={{ flexBasis: "100%" }}>
                  Today's quote from ZenQuotes, shown as a scrolling marquee (quote → author →
                  attribution) on each assigned screen. Pick screens above, then Send. The
                  attribution “{ZEN_ATTRIBUTION}” is always included, as required by the free API.
                </Text>
              </>
            )}

            {template === "rain" && (
              <>
                <label className="field">
                  <Text size="1" color="gray">Screens</Text>
                  <Select.Root value={rainSpans} onValueChange={(v) => setRainSpans(v as "single" | "all")}>
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="all">All 5 (one wide field)</Select.Item>
                      <Select.Item value="single">Chosen screens</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </label>
                <label className="field" style={{ minWidth: 160 }}>
                  <Text size="1" color="gray">Speed · {rainSpeed.toFixed(2)}</Text>
                  <Slider value={[rainSpeed]} min={0.3} max={1.3} step={0.05} onValueChange={([v]) => setRainSpeed(v)} />
                </label>
                <Text size="1" color="gray" style={{ flexBasis: "100%" }}>
                  Binary rain — green 0/1 columns with a bright leading character and a fading trail.
                  Loops continuously until you press Stop.
                </Text>
              </>
            )}

            {template === "crawl" && (
              <>
                <label className="field">
                  <Text size="1" color="gray">Screens</Text>
                  <Select.Root value={crawlSpans} onValueChange={(v) => setCrawlSpans(v as "single" | "all")}>
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="all">All 5 (wide crawl)</Select.Item>
                      <Select.Item value="single">Chosen screens</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </label>
                <label className="field" style={{ minWidth: 200 }}>
                  <Text size="1" color="gray">Title</Text>
                  <TextField.Root value={crawlTitle} placeholder="Title line" onChange={(e) => setCrawlTitle(e.target.value)} />
                </label>
                <label className="field" style={{ minWidth: 260, flex: 1 }}>
                  <Text size="1" color="gray">Crawl text</Text>
                  <TextArea value={crawlText} rows={3} placeholder="The scrolling body text…" onChange={(e) => setCrawlText(e.target.value)} />
                </label>
                <label className="field" style={{ minWidth: 150 }}>
                  <Text size="1" color="gray">Speed · {crawlSpeed.toFixed(2)}</Text>
                  <Slider value={[crawlSpeed]} min={0.5} max={2.5} step={0.1} onValueChange={([v]) => setCrawlSpeed(v)} />
                </label>
                <label className="field">
                  <Text size="1" color="gray">Loops</Text>
                  <Select.Root value={String(crawlLoops)} onValueChange={(v) => setCrawlLoops(Number(v))}>
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="0">Forever</Select.Item>
                      <Select.Item value="1">Once</Select.Item>
                      <Select.Item value="2">Twice</Select.Item>
                      <Select.Item value="3">3×</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </label>
                <Text size="1" color="gray" style={{ flexBasis: "100%" }}>
                  Yellow perspective scroll text — a stylistic homage. Type your own title and body above.
                </Text>
              </>
            )}

            {template === "starship" && (
              <>
                <label className="field" style={{ minWidth: 180 }}>
                  <Text size="1" color="gray">Flight time · {starSpeed} steps (higher = slower)</Text>
                  <Slider value={[starSpeed]} min={80} max={400} step={10} onValueChange={([v]) => setStarSpeed(v)} />
                </label>
                <Text as="label" size="2">
                  <Flex gap="2" align="center"><Switch checked={starLoop} onCheckedChange={setStarLoop} />loop</Flex>
                </Text>
                <Text size="1" color="gray" style={{ flexBasis: "100%" }}>
                  A pixel-art starship crosses all 5 screens left-to-right over a drifting starfield,
                  with a warp-glow trail. Always spans the full row.
                </Text>
              </>
            )}
          </Flex>
        </Card>

        {/* 4. Preview & send */}
        <Card size="2">
          <Heading size="3" mb="3">4 · Preview &amp; send</Heading>
          <Flex gap="4" wrap="wrap" align="start">
            {isStrip ? (
              <canvas ref={stripRef} width={640} height={128} className="preview-strip" />
            ) : (
              <canvas ref={previewRef} width={128} height={128} className="preview" />
            )}
            <Box style={{ flex: 1, minWidth: 240 }}>
              {isEffect ? (
                effectRunning ? (
                  <Button size="3" color="red" style={{ width: "100%", maxWidth: 360 }} onClick={() => stopEffect(true)}>
                    ■ Stop effect
                  </Button>
                ) : (
                  <Button size="3" style={{ width: "100%", maxWidth: 360 }} disabled={effAll ? false : !screens.length} onClick={startEffect}>
                    ▶ Play {TEMPLATE_LABEL[template]}
                  </Button>
                )
              ) : (
                <Button size="3" style={{ width: "100%", maxWidth: 360 }} disabled={busy || !screens.length} onClick={send}>
                  {busy ? "Sending…" : `Send to ${describeScreens(screens)}`}
                </Button>
              )}
              {reply && <Msg m={reply} />}
            </Box>
          </Flex>
          {script && (
            <Box mt="3">
              <Text size="2" color="gray">Bridge not running — copy this script and run it locally (<code>python pixelgate_send.py</code>):</Text>
              <textarea readOnly value={script} rows={12} className="script-ta" />
            </Box>
          )}
        </Card>

        {/* What's new */}
        <Card size="2">
          <Flex justify="between" align="center">
            <Link href="#" onClick={(e) => { e.preventDefault(); setShowChanges((v) => !v); }}>
              {showChanges ? "Hide what's new" : "What's new"}
            </Link>
            <Link href={`${GITHUB_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener noreferrer" size="1">
              full changelog →
            </Link>
          </Flex>
          {showChanges && (
            <Flex direction="column" gap="3" mt="3">
              {CHANGES.map((c) => (
                <Box key={c.v}>
                  <Badge variant="soft" mb="1">v{c.v}</Badge>
                  <ul className="changes">
                    {c.notes.map((n, i) => (
                      <li key={i}><Text size="2" color="gray">{n}</Text></li>
                    ))}
                  </ul>
                </Box>
              ))}
            </Flex>
          )}
        </Card>

        {/* FAQ */}
        <Card size="2">
          <Link href="#" onClick={(e) => { e.preventDefault(); setShowFaq((v) => !v); }}>
            {showFaq ? "Hide FAQ" : "FAQ"}
          </Link>
          {showFaq && (
            <Flex direction="column" gap="2" mt="3">
              {FAQ.map((f) => (
                <details key={f.q} className="faq-item">
                  <summary>{f.q}</summary>
                  <Text size="2" color="gray" as="p" mt="1">{f.a}</Text>
                </details>
              ))}
            </Flex>
          )}
        </Card>

        <Flex gap="3" justify="center" align="center" wrap="wrap" pb="4">
          <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</Link>
          <Text color="gray">·</Text>
          <Link href={`${GITHUB_URL}/blob/main/docs/ACKNOWLEDGEMENTS.md`} target="_blank" rel="noopener noreferrer">Acknowledgements</Link>
          <Text color="gray">·</Text>
          <Link href={`${GITHUB_URL}/blob/main/docs/DISCLAIMER.md`} target="_blank" rel="noopener noreferrer">Disclaimer</Link>
          <Text size="1" color="gray" style={{ flexBasis: "100%", textAlign: "center" }}>
            Unofficial · not affiliated with Divoom · use at your own risk
          </Text>
        </Flex>
      </Flex>
    </Container>
  );
}
