// Canvas renderers -> 128x128 frames. Templates build on these; App converts the
// resulting canvases to base64 JPEG via timesgate.canvasToJpegBase64.

import { IMG_SIZE } from "./timesgate";
import type { WeatherData, WeatherIcon } from "./weather";

export function newCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = IMG_SIZE;
  c.height = IMG_SIZE;
  return c;
}

export function renderSolid(color: string): HTMLCanvasElement {
  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  return c;
}

/** Analog clock — one frame for a given time. Loop client-side to "tick". */
export function renderClock(
  d: Date,
  opts: { bg?: string; face?: string; accent?: string; seconds?: boolean } = {},
): HTMLCanvasElement {
  const bg = opts.bg ?? "#000000";
  const face = opts.face ?? "#141828";
  const accent = opts.accent ?? "#00C8FF";
  const c = newCanvas();
  const g = c.getContext("2d")!;
  const C = IMG_SIZE / 2;
  const R = C - 6;
  g.fillStyle = bg;
  g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  g.strokeStyle = accent;
  g.lineWidth = 2;
  g.fillStyle = face;
  g.beginPath();
  g.arc(C, C, R, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.strokeStyle = "#7882A0";
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 - 90) * (Math.PI / 180);
    g.beginPath();
    g.moveTo(C + Math.cos(a) * (R - 8), C + Math.sin(a) * (R - 8));
    g.lineTo(C + Math.cos(a) * (R - 2), C + Math.sin(a) * (R - 2));
    g.stroke();
  }
  const hand = (frac: number, len: number, color: string, w: number) => {
    const a = (frac * 360 - 90) * (Math.PI / 180);
    g.strokeStyle = color;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(C, C);
    g.lineTo(C + Math.cos(a) * len, C + Math.sin(a) * len);
    g.stroke();
  };
  const h = d.getHours() % 12;
  const m = d.getMinutes();
  const s = d.getSeconds();
  hand((h + m / 60) / 12, R * 0.5, "#E6E6FF", 5);
  hand((m + s / 60) / 60, R * 0.75, "#E6E6FF", 3);
  if (opts.seconds !== false) hand(s / 60, R * 0.85, accent, 1);
  g.fillStyle = accent;
  g.beginPath();
  g.arc(C, C, 3, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Big digital clock frame (hh:mm:ss). */
export function renderDigital(
  d: Date,
  opts: { bg?: string; color?: string; seconds?: boolean } = {},
): HTMLCanvasElement {
  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.fillStyle = opts.bg ?? "#05070F";
  g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hh = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  g.fillStyle = opts.color ?? "#00E5FF";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "bold 42px 'Consolas', monospace";
  g.fillText(hh, C_MID, opts.seconds ? 52 : 64);
  if (opts.seconds) {
    g.font = "bold 26px 'Consolas', monospace";
    g.fillText(pad(d.getSeconds()), C_MID, 92);
  }
  return c;
}
const C_MID = IMG_SIZE / 2;

/** Approximate preview of the text/marquee overlay (device does the real scroll). */
export function renderText(
  text: string,
  color: string,
  bg: string,
): HTMLCanvasElement {
  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  g.fillStyle = color;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.font = "bold 15px 'Consolas', monospace";
  g.fillText(text || " ", 4, IMG_SIZE / 2);
  // subtle marquee hint
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.font = "9px system-ui, sans-serif";
  g.fillText("scrolls on device →", 4, IMG_SIZE - 10);
  return c;
}

/** Bouncing ball animation frames. */
export function renderBall(
  frames = 30,
  opts: { bg?: string; ball?: string; radius?: number } = {},
): HTMLCanvasElement[] {
  const bg = opts.bg ?? "#08081A";
  const ballColor = opts.ball ?? "#FF5A28";
  const radius = opts.radius ?? 12;
  const out: HTMLCanvasElement[] = [];
  let x = radius + 4;
  let y = radius + 4;
  let vx = 5;
  let vy = 0;
  const g0 = 1.1;
  const lo = radius;
  const hi = IMG_SIZE - radius;
  for (let f = 0; f < frames; f++) {
    vy += g0;
    x += vx;
    y += vy;
    if (x < lo) {
      x = lo;
      vx = -vx;
    }
    if (x > hi) {
      x = hi;
      vx = -vx;
    }
    if (y > hi) {
      y = hi;
      vy = -vy * 0.86;
    }
    const c = newCanvas();
    const g = c.getContext("2d")!;
    g.fillStyle = bg;
    g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
    g.fillStyle = ballColor;
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#FFFFFF";
    g.beginPath();
    g.arc(x - radius / 3, y - radius / 3, radius / 4, 0, Math.PI * 2);
    g.fill();
    out.push(c);
  }
  return out;
}

function drawBall(
  g: CanvasRenderingContext2D,
  px: number,
  py: number,
  bx: number,
  by: number,
  r: number,
  ballColor: string,
) {
  g.strokeStyle = "#3A4256";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(px, py);
  g.lineTo(bx, by);
  g.stroke();
  g.fillStyle = ballColor;
  g.beginPath();
  g.arc(bx, by, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.beginPath();
  g.arc(bx - r / 3, by - r / 3, r / 4, 0, Math.PI * 2);
  g.fill();
}

const THETA_MAX = 0.62;

/**
 * Newton's cradle on ONE screen: five balls, the outer `numSwing` balls on each
 * side swing together (1 = classic, 2 = two-up like a real cradle).
 */
export function renderNewtonsCradle(
  frames = 40,
  opts: { bg?: string; ball?: string; numSwing?: number } = {},
): HTMLCanvasElement[] {
  const bg = opts.bg ?? "#08081A";
  const ballColor = opts.ball ?? "#C0C6D4";
  const numSwing = Math.max(1, Math.min(opts.numSwing ?? 1, 2));
  const r = 11;
  const n = 5;
  const gap = 2 * r;
  const pivotY = 16;
  const L = 78;
  const startX = (IMG_SIZE - (n - 1) * gap) / 2;
  const pivots = Array.from({ length: n }, (_, i) => ({ x: startX + i * gap, y: pivotY }));

  const out: HTMLCanvasElement[] = [];
  for (let f = 0; f < frames; f++) {
    const s = Math.sin((f / frames) * Math.PI * 2);
    const leftTheta = s < 0 ? s * THETA_MAX : 0;
    const rightTheta = s > 0 ? s * THETA_MAX : 0;
    const c = newCanvas();
    const g = c.getContext("2d")!;
    g.fillStyle = bg;
    g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
    for (let i = 0; i < n; i++) {
      let theta = 0;
      if (i < numSwing) theta = leftTheta; // leftmost group
      else if (i >= n - numSwing) theta = rightTheta; // rightmost group
      const bx = pivots[i].x + L * Math.sin(theta);
      const by = pivots[i].y + L * Math.cos(theta);
      drawBall(g, pivots[i].x, pivots[i].y, bx, by, r, ballColor);
    }
    g.fillStyle = "#4A5268";
    g.fillRect(startX - r, pivotY - 3, (n - 1) * gap + 2 * r, 3);
    out.push(c);
  }
  return out;
}

/**
 * One ball of a cradle that spans all 5 screens (one sphere per screen).
 * `screenIdx` 0-4 decides the ball's role: the outer `numSwing` screens on each
 * side swing; the middle screens hang still. All screens share the same phase so
 * the motion reads as a single cradle across the device.
 */
export function renderCradleScreen(
  screenIdx: number,
  frames = 40,
  opts: { bg?: string; ball?: string; numSwing?: number } = {},
): HTMLCanvasElement[] {
  const bg = opts.bg ?? "#08081A";
  const ballColor = opts.ball ?? "#C0C6D4";
  const numSwing = Math.max(1, Math.min(opts.numSwing ?? 1, 2));
  const r = 16;
  const px = IMG_SIZE / 2;
  const pivotY = 12;
  const L = 92;
  const isLeft = screenIdx < numSwing;
  const isRight = screenIdx >= 5 - numSwing;

  const out: HTMLCanvasElement[] = [];
  for (let f = 0; f < frames; f++) {
    const s = Math.sin((f / frames) * Math.PI * 2);
    let theta = 0;
    if (isLeft) theta = s < 0 ? s * THETA_MAX : 0;
    else if (isRight) theta = s > 0 ? s * THETA_MAX : 0;
    const bx = px + L * Math.sin(theta);
    const by = pivotY + L * Math.cos(theta);
    const c = newCanvas();
    const g = c.getContext("2d")!;
    g.fillStyle = bg;
    g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
    g.fillStyle = "#4A5268";
    g.fillRect(0, pivotY - 3, IMG_SIZE, 3); // rail across, lines up screen-to-screen
    drawBall(g, px, pivotY, bx, by, r, ballColor);
    out.push(c);
  }
  return out;
}

function fitFont(
  g: CanvasRenderingContext2D,
  text: string,
  maxPx: number,
  startSize: number,
  weight = "bold",
) {
  let size = startSize;
  g.font = `${weight} ${size}px system-ui, sans-serif`;
  while (size > 8 && g.measureText(text).width > maxPx) {
    size -= 3;
    g.font = `${weight} ${size}px system-ui, sans-serif`;
  }
}

/** One big auto-fit line, centred (scores, abbreviations). */
export function renderBigText(
  text: string,
  opts: { color?: string; bg?: string; size?: number } = {},
): HTMLCanvasElement {
  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.fillStyle = opts.bg ?? "#000000";
  g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  g.fillStyle = opts.color ?? "#FFFFFF";
  g.textAlign = "center";
  g.textBaseline = "middle";
  fitFont(g, text || " ", 118, opts.size ?? 84);
  g.fillText(text || " ", IMG_SIZE / 2, IMG_SIZE / 2 + 2);
  return c;
}

/** Two stacked centred lines (e.g. "Q3" / "3rd & 7", or date / time). */
export function renderTwoLine(
  top: string,
  bottom: string,
  opts: { color?: string; bg?: string; topColor?: string; bottomColor?: string; topSize?: number; bottomSize?: number } = {},
): HTMLCanvasElement {
  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.fillStyle = opts.bg ?? "#000000";
  g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = opts.topColor ?? opts.color ?? "#FFFFFF";
  fitFont(g, top || " ", 118, opts.topSize ?? 46);
  g.fillText(top || " ", IMG_SIZE / 2, 40);
  g.fillStyle = opts.bottomColor ?? opts.color ?? "#9AA4BD";
  fitFont(g, bottom || " ", 122, opts.bottomSize ?? 34);
  g.fillText(bottom || " ", IMG_SIZE / 2, 90);
  return c;
}

/** Overlay a team label on a logo tile (bottom band) so a pixelated crest is
 * still identifiable. */
export function labelTile(logo: HTMLCanvasElement, label: string): HTMLCanvasElement {
  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.drawImage(logo, 0, 0);
  const h = 30;
  g.fillStyle = "rgba(6,10,18,0.85)";
  g.fillRect(0, IMG_SIZE - h, IMG_SIZE, h);
  g.fillStyle = "#FFFFFF";
  g.textAlign = "center";
  g.textBaseline = "middle";
  fitFont(g, label || " ", 120, 22);
  g.fillText(label || " ", IMG_SIZE / 2, IMG_SIZE - h / 2 + 1);
  return c;
}

/** Airport screen: the universal departure (🛫) / arrival (🛬) plane pictogram
 * above the airport code. */
export function renderAirport(
  code: string,
  departing: boolean,
  opts: { bg?: string; color?: string } = {},
): HTMLCanvasElement {
  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.fillStyle = opts.bg ?? "#000000";
  g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "58px 'Segoe UI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', sans-serif";
  g.fillText(departing ? "🛫" : "🛬", IMG_SIZE / 2, 46);
  g.fillStyle = opts.color ?? "#7FE9FF";
  fitFont(g, code || "—", 118, 40);
  g.fillText(code || "—", IMG_SIZE / 2, 98);
  return c;
}

/** Three stacked centred lines (e.g. departure / arrival / time remaining). */
export function renderThreeLine(
  l1: string,
  l2: string,
  l3: string,
  opts: { bg?: string; c1?: string; c2?: string; c3?: string } = {},
): HTMLCanvasElement {
  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.fillStyle = opts.bg ?? "#000000";
  g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const rows: [string, string, number][] = [
    [l1, opts.c1 ?? "#FFFFFF", 30],
    [l2, opts.c2 ?? "#FFFFFF", 64],
    [l3, opts.c3 ?? "#00E5FF", 98],
  ];
  for (const [txt, col, y] of rows) {
    g.fillStyle = col;
    fitFont(g, txt || " ", 122, 30);
    g.fillText(txt || " ", IMG_SIZE / 2, y);
  }
  return c;
}

/** Load an image with CORS enabled so the canvas stays exportable (ESPN sends
 * Access-Control-Allow-Origin: *). */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`image load failed: ${url}`));
    im.src = url;
  });
}

/**
 * Render a (team) logo as bold 128x128 pixel art: fit onto a small grid, quantize
 * colours + boost contrast for a poster look, then nearest-neighbour upscale so
 * the pixels stay chunky. Logos are simple, so this reads well on the LCD.
 */
export function renderLogoPixelArt(
  img: HTMLImageElement,
  opts: { bg?: string; grid?: number; contrast?: number; levels?: number } = {},
): HTMLCanvasElement {
  const grid = opts.grid ?? 80; // pixel resolution before upscale (higher = sharper)
  const bg = opts.bg ?? "#FFFFFF";
  const contrast = opts.contrast ?? 1.15;
  const step = 256 / (opts.levels ?? 8); // quantize step; more levels = truer colour

  const small = document.createElement("canvas");
  small.width = grid;
  small.height = grid;
  const sg = small.getContext("2d")!;
  sg.fillStyle = bg;
  sg.fillRect(0, 0, grid, grid);

  const pad = grid * 0.07;
  const box = grid - pad * 2;
  const scale = Math.min(box / img.width, box / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  sg.imageSmoothingEnabled = true;
  sg.imageSmoothingQuality = "high";
  sg.drawImage(img, (grid - w) / 2, (grid - h) / 2, w, h);

  // Bold quantize (5 levels/channel) + contrast on the small pixels.
  const id = sg.getImageData(0, 0, grid, grid);
  const p = id.data;
  const q = (v: number) => {
    v = (v - 128) * contrast + 128;
    v = Math.max(0, Math.min(255, v));
    return Math.min(255, Math.round(v / step) * step);
  };
  for (let i = 0; i < p.length; i += 4) {
    p[i] = q(p[i]);
    p[i + 1] = q(p[i + 1]);
    p[i + 2] = q(p[i + 2]);
  }
  sg.putImageData(id, 0, 0);

  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false; // nearest-neighbour -> chunky pixels
  g.drawImage(small, 0, 0, IMG_SIZE, IMG_SIZE);
  return c;
}

/** Draw an uploaded image cover-fit into 128x128. */
export async function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("image load failed"));
      im.src = url;
    });
    const c = newCanvas();
    const g = c.getContext("2d")!;
    g.fillStyle = "#000";
    g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
    const scale = Math.max(IMG_SIZE / img.width, IMG_SIZE / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    g.drawImage(img, (IMG_SIZE - w) / 2, (IMG_SIZE - h) / 2, w, h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- wrapped text (quotes, spread tiles) ---------------------------------
function wrapWords(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > maxW && line) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** Word-wrapped, auto-fitted centred text with an optional footer line (e.g. a
 * quote body with the author underneath). Shrinks the font until it fits. */
export function renderWrapped(
  text: string,
  opts: { bg?: string; color?: string; maxFont?: number; minFont?: number; footer?: string; footerColor?: string } = {},
): HTMLCanvasElement {
  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.fillStyle = opts.bg ?? "#000000";
  g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  const pad = 8;
  const maxW = IMG_SIZE - pad * 2;
  const footerH = opts.footer ? 18 : 0;
  const availH = IMG_SIZE - pad * 2 - footerH;
  let font = opts.maxFont ?? 18;
  const minF = opts.minFont ?? 7;
  let lines: string[] = [];
  for (; font >= minF; font--) {
    g.font = `bold ${font}px system-ui, sans-serif`;
    lines = wrapWords(g, text, maxW);
    // Must fit BOTH the available height AND the width — a long unbreakable word
    // (e.g. a long single-word city name) would otherwise overflow and clip.
    const widest = lines.reduce((m, l) => Math.max(m, g.measureText(l).width), 0);
    if (lines.length * font * 1.25 <= availH && widest <= maxW) break;
  }
  const lh = font * 1.25;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = opts.color ?? "#FFFFFF";
  const totalH = lines.length * lh;
  let y = pad + (availH - totalH) / 2 + lh / 2;
  for (const ln of lines) {
    g.fillText(ln, IMG_SIZE / 2, y);
    y += lh;
  }
  if (opts.footer) {
    g.font = "bold 12px system-ui, sans-serif";
    g.fillStyle = opts.footerColor ?? "#7FE9FF";
    g.fillText(opts.footer, IMG_SIZE / 2, IMG_SIZE - pad - 3);
  }
  return c;
}

// ---- weather widget ------------------------------------------------------
const WX_COLOR: Record<WeatherIcon, string> = {
  clear: "#FFD23F",
  partly: "#FFD23F",
  cloud: "#B7C0D0",
  fog: "#9AA4BD",
  rain: "#5AA9FF",
  snow: "#E8F4FF",
  storm: "#FFE14D",
};

function drawSun(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.strokeStyle = "#FFD23F";
  g.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (r + 3), cy + Math.sin(a) * (r + 3));
    g.lineTo(cx + Math.cos(a) * (r + 9), cy + Math.sin(a) * (r + 9));
    g.stroke();
  }
  g.fillStyle = "#FFD23F";
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
}

function drawCloud(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(cx - s * 0.6, cy, s * 0.55, 0, Math.PI * 2);
  g.arc(cx + s * 0.6, cy, s * 0.6, 0, Math.PI * 2);
  g.arc(cx, cy - s * 0.5, s * 0.65, 0, Math.PI * 2);
  g.fill();
  g.fillRect(cx - s * 1.15, cy - 1, s * 2.3, s * 0.8);
}

function drawWxIcon(g: CanvasRenderingContext2D, cx: number, cy: number, icon: WeatherIcon) {
  const s = 15;
  switch (icon) {
    case "clear":
      drawSun(g, cx, cy, 14);
      break;
    case "partly":
      drawSun(g, cx - 10, cy - 12, 9);
      drawCloud(g, cx + 3, cy + 4, s, "#B7C0D0");
      break;
    case "cloud":
      drawCloud(g, cx, cy, s, "#B7C0D0");
      break;
    case "fog":
      drawCloud(g, cx, cy - 4, s, "#B7C0D0");
      g.strokeStyle = "#9AA4BD";
      g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const y = cy + 14 + i * 7;
        g.beginPath();
        g.moveTo(cx - 16, y);
        g.lineTo(cx + 16, y);
        g.stroke();
      }
      break;
    case "rain":
      drawCloud(g, cx, cy - 4, s, "#8892A6");
      g.strokeStyle = "#5AA9FF";
      g.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        const x = cx + i * 11;
        g.beginPath();
        g.moveTo(x + 3, cy + 12);
        g.lineTo(x - 2, cy + 24);
        g.stroke();
      }
      break;
    case "snow":
      drawCloud(g, cx, cy - 4, s, "#8892A6");
      g.fillStyle = "#E8F4FF";
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.arc(cx + i * 11, cy + 18, 2.6, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case "storm":
      drawCloud(g, cx, cy - 4, s, "#7A8296");
      g.fillStyle = "#FFE14D";
      g.beginPath();
      g.moveTo(cx + 2, cy + 8);
      g.lineTo(cx - 8, cy + 22);
      g.lineTo(cx - 1, cy + 22);
      g.lineTo(cx - 6, cy + 32);
      g.lineTo(cx + 9, cy + 16);
      g.lineTo(cx + 1, cy + 16);
      g.closePath();
      g.fill();
      break;
  }
}

/** Weather widget: city, an icon for current conditions, the temperature in both
 * °F (big) and °C (small), and today's high/low. Built to stay legible at 128px. */
export function renderWeather(w: WeatherData): HTMLCanvasElement {
  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.fillStyle = "#000000";
  g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  g.textAlign = "center";
  g.textBaseline = "middle";

  // city
  g.fillStyle = "#FFFFFF";
  fitFont(g, w.city, 124, 18);
  g.fillText(w.city, IMG_SIZE / 2, 11);

  // condition icon (left) — draw before temp so text is never occluded
  drawWxIcon(g, 34, 50, w.icon);

  // temperature: °F big, °C small underneath (right half)
  g.textAlign = "center";
  g.fillStyle = "#FFFFFF";
  fitFont(g, `${w.tempF}°`, 66, 36);
  g.fillText(`${w.tempF}°`, 92, 44);
  g.fillStyle = "#9AA4BD";
  g.font = "bold 15px system-ui, sans-serif";
  g.fillText(`${w.tempC}°C`, 92, 70);

  // description
  g.fillStyle = WX_COLOR[w.icon];
  fitFont(g, w.desc, 124, 18);
  g.fillText(w.desc, IMG_SIZE / 2, 94);

  // today's high / low
  g.font = "bold 14px system-ui, sans-serif";
  const hi = `H ${w.hiF}°`;
  const lo = `L ${w.loF}°`;
  const gap = 12;
  const wHi = g.measureText(hi).width;
  const wLo = g.measureText(lo).width;
  const total = wHi + gap + wLo;
  const startX = (IMG_SIZE - total) / 2;
  g.textAlign = "left";
  g.fillStyle = "#FF9E4A";
  g.fillText(hi, startX, 114);
  g.fillStyle = "#6FC7FF";
  g.fillText(lo, startX + wHi + gap, 114);
  return c;
}

// One 128x128 tile with a small caption on top and a big value centred below.
function statTile(caption: string, value: string, valueColor: string, capColor = "#9AA4BD"): HTMLCanvasElement {
  const c = newCanvas();
  const g = c.getContext("2d")!;
  g.fillStyle = "#000000";
  g.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = capColor;
  g.font = "bold 16px system-ui, sans-serif";
  g.fillText(caption, IMG_SIZE / 2, 24);
  g.fillStyle = valueColor;
  fitFont(g, value, 118, 62);
  g.fillText(value, IMG_SIZE / 2, 78);
  return c;
}

/** Weather spread across all 5 screens: 0 city · 1 condition icon + word ·
 * 2 temperature (°F and °C) · 3 today's high · 4 today's low. */
export function renderWeatherSpread(w: WeatherData): HTMLCanvasElement[] {
  // 0: city (minFont low so long single-word names shrink to fit instead of clipping)
  const city = renderWrapped(w.city, { maxFont: 34, minFont: 8, color: "#FFFFFF" });

  // 1: big condition icon + description word
  const icon = newCanvas();
  const ig = icon.getContext("2d")!;
  ig.fillStyle = "#000000";
  ig.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
  ig.save();
  ig.translate(IMG_SIZE / 2, 54);
  ig.scale(2.3, 2.3);
  drawWxIcon(ig, 0, 0, w.icon);
  ig.restore();
  ig.textAlign = "center";
  ig.textBaseline = "middle";
  ig.fillStyle = WX_COLOR[w.icon];
  fitFont(ig, w.desc, 120, 22);
  ig.fillText(w.desc, IMG_SIZE / 2, 108);

  // 2: temperature — °F big, °C under
  const temp = renderTwoLine(`${w.tempF}°F`, `${w.tempC}°C`, {
    topColor: "#FFFFFF", bottomColor: "#9AA4BD", topSize: 46, bottomSize: 34,
  });

  // 3 / 4: today's high / low
  const hi = statTile("HIGH", `${w.hiF}°`, "#FF9E4A");
  const lo = statTile("LOW", `${w.loF}°`, "#6FC7FF");

  return [city, icon, temp, hi, lo];
}
