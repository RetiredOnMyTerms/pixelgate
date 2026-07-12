// Canvas renderers -> 128x128 frames. Templates build on these; App converts the
// resulting canvases to base64 JPEG via timesgate.canvasToJpegBase64.

import { IMG_SIZE } from "./timesgate";

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
