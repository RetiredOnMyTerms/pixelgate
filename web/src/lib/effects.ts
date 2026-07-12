// Animated visual effects.
//
// The Times Gate's Draw/SendHttpGif plays a pushed multi-frame animation and
// LOOPS it on-device. So the reliable, judder-free way to run a continuous
// effect is to push ONE self-contained loop and let the firmware loop it — the
// same thing the Newton's cradle does. Streaming short animations back-to-back
// makes the device rewind the current batch before the next arrives (visible
// stutter/flash), so we avoid that.
//
//   mode "loop"   -> a seamless N-frame loop; the App pushes it ONCE. (rain, starship)
//   mode "stream" -> open-ended; the App pushes ONE static frame per tick, so
//                    there is no on-device animation to rewind. (opening crawl)
//
//   spans "single" -> each timestep yields 1 canvas (drawn on the chosen screens)
//   spans "all"    -> each timestep yields 5 canvases (a 640-wide field sliced
//                     into the 5 screen tiles)

export const W = 128;

export type Effect = {
  spans: "single" | "all";
  mode: "loop" | "stream";
  /** Frames in one on-device loop (mode "loop"). */
  loopLen: number;
  /** Milliseconds per frame the device should hold (loop) / tick interval (stream). */
  picSpeed: number;
  /** loop mode: keep the device looping (true) vs. play `runCount` passes then revert. */
  loopForever: boolean;
  /** loop mode + !loopForever: how many passes before reverting. */
  runCount: number;
  /** stream mode: set once the animation has finished. */
  done: boolean;
  /** Advance state by `n` timesteps; return one entry per step (per-screen canvases). */
  nextBatch(n: number): HTMLCanvasElement[][];
};

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Split a 640x128 wide canvas into the 5 128x128 screen tiles. */
function slice5(wide: HTMLCanvasElement): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < 5; i++) {
    const t = canvas(W, W);
    t.getContext("2d")!.drawImage(wide, i * W, 0, W, W, 0, 0, W, W);
    out.push(t);
  }
  return out;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ==========================================================================
// Effect 1: Digital rain ("Matrix" binary rain) — seamless on-device loop
// ==========================================================================
type RainCol = { xPx: number; speed: number; start: number; trail: number; chars: number[] };

export function createRain(opts: { spans: "single" | "all"; speed?: number; cell?: number }): Effect {
  const width = opts.spans === "all" ? W * 5 : W;
  const cell = opts.cell ?? 8;
  const screenRows = Math.ceil(W / cell);
  const totalRows = screenRows + 22; // extra off-screen rows so recycling is hidden
  const L = 30; // loop length in frames (kept under the device's ~40/animation cap)
  const cols = Math.ceil(width / cell);
  // Playback rate from the speed knob (0.3 slow .. 1.3 fast) -> ms per frame.
  const picSpeed = Math.round(clamp(140 - (opts.speed ?? 0.7) * 70, 45, 130));

  const columns: RainCol[] = [];
  for (let c = 0; c < cols; c++) {
    // A column advances a WHOLE number of rows over the loop (m*totalRows), so it
    // returns to its exact start state at frame L -> the loop is seamless.
    const m = Math.random() < 0.6 ? 1 : 2;
    columns.push({
      xPx: c * cell,
      speed: (m * totalRows) / L,
      start: rand(0, totalRows),
      trail: Math.round(rand(8, 18)),
      chars: Array.from({ length: totalRows }, () => (Math.random() < 0.5 ? 0 : 1)),
    });
  }

  function frameAt(f: number): HTMLCanvasElement {
    const c = canvas(width, W);
    const g = c.getContext("2d")!;
    g.fillStyle = "#000000";
    g.fillRect(0, 0, width, W);
    g.font = `${cell}px monospace`;
    g.textBaseline = "top";
    for (const col of columns) {
      const head = (col.start + f * col.speed) % totalRows;
      const headRow = Math.floor(head);
      for (let k = 0; k < col.trail; k++) {
        const row = headRow - k;
        if (row < 0) continue; // trail above the top edge
        const y = row * cell;
        if (y > W) continue; // below the screen (off-screen buffer)
        const ch = col.chars[row % col.chars.length] ? "1" : "0";
        if (k === 0) g.fillStyle = "#DFFFE0"; // bright leading char
        else {
          const t = 1 - k / col.trail;
          g.fillStyle = `rgb(0,${Math.round(60 + 195 * t)},40)`;
        }
        g.fillText(ch, col.xPx, y);
      }
    }
    return c;
  }

  let frame = 0;
  return {
    spans: opts.spans,
    mode: "loop",
    loopLen: L,
    picSpeed,
    loopForever: true,
    runCount: 1,
    done: false,
    nextBatch(n: number) {
      const out: HTMLCanvasElement[][] = [];
      for (let i = 0; i < n; i++) {
        const wide = frameAt(frame % L);
        frame++;
        out.push(opts.spans === "all" ? slice5(wide) : [wide]);
      }
      return out;
    },
  };
}

// ==========================================================================
// Effect 2: Opening crawl (perspective scroll text) — single-frame stream
// ==========================================================================
const CRAWL_YELLOW = "#FFD227";

export function createCrawl(opts: {
  spans: "single" | "all";
  title: string;
  text: string;
  speed?: number; // px scrolled per tick
  loops?: number; // 0 = forever
}): Effect {
  const width = opts.spans === "all" ? W * 5 : W;
  const speed = opts.speed ?? 1.1;
  const maxLoops = opts.loops ?? 0;

  const baseFont = opts.spans === "all" ? 15 : 11;
  const wrapPx = width - (opts.spans === "all" ? 120 : 16);
  const lines: { text: string; title: boolean }[] = [];
  const measure = canvas(10, 10).getContext("2d")!;

  function wrap(str: string, fontPx: number): string[] {
    measure.font = `bold ${fontPx}px monospace`;
    const words = str.split(/\s+/).filter(Boolean);
    const rowsOut: string[] = [];
    let line = "";
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (measure.measureText(t).width > wrapPx && line) {
        rowsOut.push(line);
        line = w;
      } else line = t;
    }
    if (line) rowsOut.push(line);
    return rowsOut;
  }

  if (opts.title.trim())
    for (const l of wrap(opts.title.trim().toUpperCase(), Math.round(baseFont * 1.4)))
      lines.push({ text: l, title: true });
  if (opts.title.trim() && opts.text.trim()) lines.push({ text: "", title: false });
  for (const para of opts.text.split(/\n+/))
    for (const l of wrap(para.trim(), baseFont)) lines.push({ text: l, title: false });
  if (!lines.length) lines.push({ text: " ", title: false });

  const LG = Math.round(baseFont * 1.6);
  const yTop = 6;
  const minScale = 0.32;
  const scaleAt = (y: number) => minScale + (1 - minScale) * Math.min(1, Math.max(0, (y - yTop) / (W - yTop)));

  // One full cycle: empty (text below the screen) -> content rises through ->
  // empty (text above). Frames 0 and F are both empty, so the on-device loop is
  // seamless. We push this ONCE and let the firmware loop it — no streaming.
  // D is sized to the perspective-SCALED block height (gaps shrink as lines
  // recede up), so content stays centred and the empty ends stay short.
  const avgScale = (1 + minScale) / 2;
  const blockH = lines.length * LG * avgScale;
  const D = W + LG + blockH + LG; // full scroll distance for one cycle
  const F = Math.round(clamp(D / (opts.spans === "all" ? 14 : 9), 20, 36));
  const step = D / F;
  // speed knob (0.5 slow .. 2.5 fast) -> ms per frame the device holds.
  const picSpeed = Math.round(clamp(150 - speed * 40, 45, 140));

  function frameAt(f: number): HTMLCanvasElement {
    const c = canvas(width, W);
    const g = c.getContext("2d")!;
    g.fillStyle = "#000000";
    g.fillRect(0, 0, width, W);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = CRAWL_YELLOW;
    // First line starts just below the bottom edge and rises as scroll grows;
    // later lines sit below it, so the title leads and exits the top first.
    let y = W + LG - f * step;
    for (const ln of lines) {
      const s = scaleAt(y);
      if (y >= yTop && y <= W && ln.text) {
        const fp = Math.max(5, Math.round((ln.title ? baseFont * 1.4 : baseFont) * s));
        g.font = `bold ${fp}px monospace`;
        g.fillText(ln.text, width / 2, y);
      }
      y += LG * s;
    }
    return c;
  }

  let frame = 0;
  return {
    spans: opts.spans,
    mode: "loop",
    loopLen: F,
    picSpeed,
    loopForever: maxLoops === 0,
    runCount: maxLoops || 1,
    done: false,
    nextBatch(n: number) {
      const out: HTMLCanvasElement[][] = [];
      for (let i = 0; i < n; i++) {
        const c = frameAt(frame % F);
        frame++;
        out.push(opts.spans === "all" ? slice5(c) : [c]);
      }
      return out;
    },
  };
}

// ==========================================================================
// Effect 3: Starship flyby — precomputed traverse, seamless on-device loop
// ==========================================================================
type Star = { x: number; y: number; phase: number; big: boolean };

const HULL = "#C7D0E0";
const DARK = "#8A94AA";

function fillEllipse(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

// A fading engine/warp streak trailing to the LEFT (behind a ship moving right).
function trail(g: CanvasRenderingContext2D, x: number, ys: number[], rgb: string, len = 20, h = 2) {
  for (let i = 0; i < len; i++) {
    const a = (1 - i / len) * 0.5;
    g.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
    for (const y of ys) g.fillRect(x - i * 3, y - h / 2, 3, h);
  }
}

// Each ship is a simplified pixel-art silhouette (a fan-art homage, not a
// reproduction of official artwork), drawn facing RIGHT with its rear at `x`.

function drawEntD(g: CanvasRenderingContext2D, x: number, cy: number) {
  const glow = "#4FB0FF";
  const nyTop = cy - 25, nyBot = cy - 13;
  trail(g, x, [nyTop, nyBot], "79,176,255");
  g.fillStyle = HULL; fillEllipse(g, x + 40, cy + 11, 22, 8); // engineering hull
  g.strokeStyle = DARK; g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x + 34, nyTop); g.lineTo(x + 44, cy + 6);
  g.moveTo(x + 34, nyBot); g.lineTo(x + 46, cy + 6);
  g.stroke();
  for (const ny of [nyTop, nyBot]) {
    g.fillStyle = DARK; fillEllipse(g, x + 26, ny, 24, 3.5);
    g.fillStyle = glow; fillEllipse(g, x + 48, ny, 3.5, 3.5);
  }
  g.fillStyle = DARK;
  g.beginPath(); g.moveTo(x + 66, cy - 2); g.lineTo(x + 56, cy + 6); g.lineTo(x + 68, cy + 6); g.closePath(); g.fill();
  g.fillStyle = HULL; fillEllipse(g, x + 80, cy - 4, 28, 10); // saucer
  g.fillStyle = DARK; fillEllipse(g, x + 84, cy - 9, 8, 4);   // bridge dome
}

function drawEnt1701(g: CanvasRenderingContext2D, x: number, cy: number) {
  const nyTop = cy - 24, nyBot = cy - 14;
  trail(g, x, [nyTop, nyBot], "79,176,255");
  // secondary (engineering) hull — cigar with a pointed nose
  g.fillStyle = HULL; fillEllipse(g, x + 44, cy + 9, 24, 6);
  g.beginPath(); g.moveTo(x + 66, cy + 9); g.lineTo(x + 80, cy + 6); g.lineTo(x + 80, cy + 12); g.closePath(); g.fill();
  // pylons up to the nacelles
  g.strokeStyle = DARK; g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x + 40, cy + 4); g.lineTo(x + 34, nyTop);
  g.moveTo(x + 44, cy + 4); g.lineTo(x + 38, nyBot);
  g.stroke();
  // thin cylindrical nacelles with ORANGE Bussard caps at the front
  for (const ny of [nyTop, nyBot]) {
    g.fillStyle = DARK; fillEllipse(g, x + 26, ny, 24, 3);
    g.fillStyle = "#FF7A3C"; fillEllipse(g, x + 48, ny, 3.5, 3.5);
    g.fillStyle = "#7FD8FF"; fillEllipse(g, x + 3, ny, 2.5, 2.5);
  }
  // neck + clean disc saucer
  g.fillStyle = DARK;
  g.beginPath(); g.moveTo(x + 68, cy); g.lineTo(x + 58, cy + 6); g.lineTo(x + 70, cy + 6); g.closePath(); g.fill();
  g.fillStyle = HULL; fillEllipse(g, x + 82, cy - 6, 24, 7);
  g.fillStyle = DARK; fillEllipse(g, x + 84, cy - 10, 7, 3);
}

function drawVoyager(g: CanvasRenderingContext2D, x: number, cy: number) {
  trail(g, x, [cy + 2], "79,176,255", 16);
  // sleek arrowhead body pointing right
  g.fillStyle = HULL;
  g.beginPath();
  g.moveTo(x + 82, cy);
  g.lineTo(x + 40, cy - 12);
  g.lineTo(x + 14, cy - 5);
  g.lineTo(x + 14, cy + 8);
  g.lineTo(x + 40, cy + 12);
  g.closePath(); g.fill();
  g.fillStyle = DARK; fillEllipse(g, x + 42, cy + 8, 16, 5); // lower body
  // two nacelles angled UP at the back (Intrepid's variable geometry)
  for (const off of [-6, -15]) {
    g.save();
    g.translate(x + 30, cy + off);
    g.rotate((-20 * Math.PI) / 180);
    g.fillStyle = DARK; fillEllipse(g, 0, 0, 16, 3.5);
    g.fillStyle = "#4FB0FF"; fillEllipse(g, 14, 0, 3, 3);
    g.restore();
  }
}

function drawDeathStar(g: CanvasRenderingContext2D, x: number, cy: number) {
  const r = 46, cx = x + 52;
  g.fillStyle = "#9AA0AA"; fillEllipse(g, cx, cy, r, r);
  // lower-hemisphere shading
  g.fillStyle = "#7E848E";
  g.beginPath(); g.arc(cx, cy, r, 0.12 * Math.PI, 0.88 * Math.PI, false); g.closePath(); g.fill();
  // equatorial trench
  g.strokeStyle = "#5A606B"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.stroke();
  // superlaser dish + green focus
  g.fillStyle = "#6A707A"; fillEllipse(g, cx + 15, cy - 18, 13, 13);
  g.strokeStyle = "#4A505A"; g.lineWidth = 2;
  g.beginPath(); g.arc(cx + 15, cy - 18, 13, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#39E27A"; fillEllipse(g, cx + 15, cy - 18, 3, 3);
}

function drawFalcon(g: CanvasRenderingContext2D, x: number, cy: number) {
  const beige = "#B9BEC7", dk = "#8A9099";
  // rear engine glow
  for (let i = 0; i < 14; i++) {
    const a = (1 - i / 14) * 0.6;
    g.fillStyle = `rgba(150,205,255,${a.toFixed(3)})`;
    g.fillRect(x + 4 - i * 3, cy - 6, 3, 12);
  }
  g.fillStyle = beige; fillEllipse(g, x + 42, cy, 34, 15); // main disc
  g.fillStyle = "#CFE6FF"; g.fillRect(x + 8, cy - 8, 4, 16); // engine bar
  g.fillStyle = dk; fillEllipse(g, x + 34, cy - 2, 7, 7);    // center dish
  // front mandibles (two prongs)
  g.fillStyle = beige;
  g.fillRect(x + 72, cy - 11, 20, 7);
  g.fillRect(x + 72, cy + 4, 20, 7);
  // offset cockpit
  g.fillStyle = beige; g.fillRect(x + 64, cy + 11, 12, 5);
  g.fillStyle = dk; fillEllipse(g, x + 80, cy + 15, 6, 5);
}

function drawRazorCrest(g: CanvasRenderingContext2D, x: number, cy: number) {
  const m = "#AEB4BD", dk = "#7E848E";
  for (let i = 0; i < 12; i++) {
    const a = (1 - i / 12) * 0.6;
    g.fillStyle = `rgba(130,195,255,${a.toFixed(3)})`;
    g.fillRect(x - i * 3, cy - 5, 3, 10);
  }
  // two tall vertical tail fins at the rear
  g.fillStyle = dk;
  g.fillRect(x + 8, cy - 26, 7, 26);
  g.fillRect(x + 8, cy, 7, 26);
  // blocky fuselage
  g.fillStyle = m;
  g.beginPath();
  g.moveTo(x + 12, cy - 9); g.lineTo(x + 66, cy - 9); g.lineTo(x + 84, cy - 3);
  g.lineTo(x + 84, cy + 5); g.lineTo(x + 66, cy + 11); g.lineTo(x + 12, cy + 11);
  g.closePath(); g.fill();
  g.fillStyle = dk; g.fillRect(x + 12, cy - 7, 8, 16); // engine block
  g.fillStyle = "#3A4652"; // cockpit windshield
  g.beginPath(); g.moveTo(x + 70, cy - 6); g.lineTo(x + 82, cy - 1); g.lineTo(x + 70, cy + 3); g.closePath(); g.fill();
}

export type ShipId = "entD" | "ent1701" | "voyager" | "falcon" | "razorcrest" | "deathstar";
export const SHIPS: { id: ShipId; name: string }[] = [
  { id: "entD", name: "U.S.S. Enterprise NCC-1701-D (Galaxy)" },
  { id: "ent1701", name: "U.S.S. Enterprise NCC-1701 (TOS)" },
  { id: "voyager", name: "U.S.S. Voyager NCC-74656" },
  { id: "falcon", name: "Millennium Falcon" },
  { id: "razorcrest", name: "Razor Crest" },
  { id: "deathstar", name: "Death Star" },
];
const SHIP_SPEC: Record<ShipId, { w: number; draw: (g: CanvasRenderingContext2D, x: number, cy: number) => void }> = {
  entD: { w: 98, draw: drawEntD },
  ent1701: { w: 100, draw: drawEnt1701 },
  voyager: { w: 90, draw: drawVoyager },
  falcon: { w: 96, draw: drawFalcon },
  razorcrest: { w: 96, draw: drawRazorCrest },
  deathstar: { w: 108, draw: drawDeathStar },
};

export function createStarship(opts: { speed?: number; loop?: boolean; ship?: ShipId }): Effect {
  const spec = SHIP_SPEC[opts.ship ?? "entD"] ?? SHIP_SPEC.entD;
  const SHIP_W = spec.w;
  const width = W * 5; // always spans all 5
  const F = 36; // frames in one full traverse (under the device's ~40/animation cap)
  const dx = (width + SHIP_W * 2) / F;
  // speed knob (80 slow .. 400 fast-ish, "steps") -> ms per frame.
  const picSpeed = Math.round(clamp((opts.speed ?? 220) / 3, 40, 150));

  // Static starfield + twinkle with period F, so the pushed loop is seamless.
  const stars: Star[] = Array.from({ length: 70 }, () => ({
    x: Math.round(rand(0, width)),
    y: Math.round(rand(0, W)),
    phase: rand(0, Math.PI * 2),
    big: Math.random() < 0.15,
  }));

  function frameAt(f: number): HTMLCanvasElement {
    const c = canvas(width, W);
    const g = c.getContext("2d")!;
    g.fillStyle = "#000000";
    g.fillRect(0, 0, width, W);
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin((2 * Math.PI * f) / F + s.phase);
      const v = Math.round((s.big ? 180 : 120) + 75 * tw);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(s.x, s.y, s.big ? 2 : 1, s.big ? 2 : 1);
    }
    spec.draw(g, -SHIP_W + f * dx, 64);
    return c;
  }

  // Push ONE loop and let the firmware loop it (no continuous streaming, so no
  // "receiving" indicator). The 5 per-screen animations start together in one
  // CommandList at the same PicSpeed, so they stay in step.
  let frame = 0;
  return {
    spans: "all",
    mode: "loop",
    loopLen: F,
    picSpeed,
    loopForever: opts.loop ?? true,
    runCount: 1,
    done: false,
    nextBatch(n: number) {
      const out: HTMLCanvasElement[][] = [];
      for (let i = 0; i < n; i++) {
        out.push(slice5(frameAt(frame % F)));
        frame++;
      }
      return out;
    },
  };
}
