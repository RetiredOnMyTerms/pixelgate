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
const SHIP_W = 96;

type Star = { x: number; y: number; phase: number; big: boolean };

export function createStarship(opts: { speed?: number; loop?: boolean }): Effect {
  const width = W * 5; // always spans all 5
  const F = 36; // frames in one full traverse (under the device's ~40/animation cap)
  const dx = (width + SHIP_W * 2) / F;
  // speed knob (80 slow .. 400 fast-ish, "steps") -> ms per frame.
  const picSpeed = Math.round(clamp((opts.speed ?? 220) / 3, 40, 150));

  // Static starfield (no drift) + twinkle with period F, so the loop is seamless.
  const stars: Star[] = Array.from({ length: 70 }, () => ({
    x: Math.round(rand(0, width)),
    y: Math.round(rand(0, W)),
    phase: rand(0, Math.PI * 2),
    big: Math.random() < 0.15,
  }));

  function drawShip(g: CanvasRenderingContext2D, x: number, cy: number) {
    const hull = "#C7D0E0";
    const dark = "#8A94AA";
    const glow = "#4FB0FF";
    // Moving RIGHT: saucer leads (front/right); the two nacelles sit clearly to
    // the LEFT of the saucer so both stay visible (the previous version drew the
    // saucer over the lower nacelle, hiding it and looking like a blob).
    const nyTop = cy - 25;
    const nyBot = cy - 13;
    // engine trail behind the nacelles (to the left)
    for (let i = 0; i < 20; i++) {
      const tx = x - i * 3;
      const a = (1 - i / 20) * 0.5;
      g.fillStyle = `rgba(79,176,255,${a.toFixed(3)})`;
      g.fillRect(tx, nyTop - 1, 3, 2);
      g.fillRect(tx, nyBot - 1, 3, 2);
    }
    // engineering / secondary hull — behind and below
    g.fillStyle = hull;
    g.beginPath();
    g.ellipse(x + 40, cy + 11, 22, 8, 0, 0, Math.PI * 2);
    g.fill();
    // pylons from each nacelle down to the engineering hull
    g.strokeStyle = dark;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x + 34, nyTop);
    g.lineTo(x + 44, cy + 6);
    g.moveTo(x + 34, nyBot);
    g.lineTo(x + 46, cy + 6);
    g.stroke();
    // two warp nacelles (elongated, trailing left) with bright front (right) caps
    for (const ny of [nyTop, nyBot]) {
      g.fillStyle = dark;
      g.beginPath();
      g.ellipse(x + 26, ny, 24, 3.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = glow;
      g.beginPath();
      g.ellipse(x + 48, ny, 3.5, 3.5, 0, 0, Math.PI * 2);
      g.fill();
    }
    // neck connecting the saucer to the engineering hull
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(x + 66, cy - 2);
    g.lineTo(x + 56, cy + 6);
    g.lineTo(x + 68, cy + 6);
    g.closePath();
    g.fill();
    // saucer (leading, right) + bridge dome — drawn last, clear of the nacelles
    g.fillStyle = hull;
    g.beginPath();
    g.ellipse(x + 80, cy - 4, 28, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = dark;
    g.beginPath();
    g.ellipse(x + 84, cy - 9, 8, 4, 0, 0, Math.PI * 2);
    g.fill();
  }

  function frame(shipX: number, t: number): HTMLCanvasElement {
    const c = canvas(width, W);
    const g = c.getContext("2d")!;
    g.fillStyle = "#000000";
    g.fillRect(0, 0, width, W);
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * 0.2 + s.phase);
      const v = Math.round((s.big ? 180 : 120) + 75 * tw);
      g.fillStyle = `rgb(${v},${v},${v})`;
      const sz = s.big ? 2 : 1;
      g.fillRect(s.x, s.y, sz, sz);
    }
    drawShip(g, shipX, 64);
    return c;
  }

  // STREAM one global frame at a time to all 5 screens (in one CommandList), so
  // every screen shows the exact same frame — the ship stays synced across the
  // whole row and flows 0->4. (Looping 5 independent per-screen animations lets
  // them drift out of phase, which breaks the flow at the screen boundaries.)
  let shipX = -SHIP_W;
  let t = 0;
  const runner: Effect = {
    spans: "all",
    mode: "stream",
    loopLen: 1,
    picSpeed,
    loopForever: opts.loop ?? true,
    runCount: 1,
    done: false,
    nextBatch(n: number) {
      const out: HTMLCanvasElement[][] = [];
      for (let i = 0; i < n && !runner.done; i++) {
        t++;
        shipX += dx;
        if (shipX > width + SHIP_W) {
          if (opts.loop ?? true) shipX = -SHIP_W;
          else { runner.done = true; break; }
        }
        out.push(slice5(frame(shipX, t)));
      }
      return out;
    },
  };
  return runner;
}
