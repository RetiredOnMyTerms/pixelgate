// Times Gate device command builders (mirror of timesgate.py).
// Pure payload construction — transport is handled by bridge.ts.
//
// Firmware rules encoded here (see repo README for the full story):
//  - every command carries an integer LocalToken
//  - Draw/SendHttpGif PicData = base64 JPEG (not raw RGB)
//  - PicID = small strictly-increasing counter (reset via Draw/ResetHttpGifId)
//  - drawing selects screens with LcdArray[5]; text/items use LcdIndex

export const SCREEN_COUNT = 5;
export const IMG_SIZE = 128;

export type Command = Record<string, unknown>;

// Shared monotonic PicID counter (device rejects reused/lower ids).
let picId = 1;
export function nextPicId(): number {
  return picId++;
}
export function resetPicIdCounter() {
  picId = 1;
}

/** int or list of 0-based indices -> length-5 0/1 mask. */
export function lcdMask(screens: number | number[]): number[] {
  const list = typeof screens === "number" ? [screens] : screens;
  const mask = Array(SCREEN_COUNT).fill(0);
  for (const s of list) mask[s] = 1;
  return mask;
}

/** First active screen in a mask (the LcdIndex a text overlay must target). */
export function firstActive(mask: number[]): number {
  const i = mask.findIndex((v) => v === 1);
  return i < 0 ? 0 : i;
}

/** Encode a canvas as base64 JPEG (Times Gate wants JPEG, quality ~0.95). */
export async function canvasToJpegBase64(
  canvas: HTMLCanvasElement,
  quality = 0.95,
): Promise<string> {
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    ),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export const resetHttpGifId = (): Command => ({ Command: "Draw/ResetHttpGifId" });

/** One Draw/SendHttpGif packet (one frame). */
export function sendHttpGifFrame(opts: {
  mask: number[];
  picNum: number;
  picOffset: number;
  picId: number;
  picSpeed: number;
  picData: string;
}): Command {
  return {
    Command: "Draw/SendHttpGif",
    LcdArray: opts.mask,
    PicNum: opts.picNum,
    PicWidth: IMG_SIZE,
    PicOffset: opts.picOffset,
    PicID: opts.picId,
    PicSpeed: opts.picSpeed,
    PicData: opts.picData,
  };
}

/** Build the full packet list for an animation (share one PicID across frames). */
export function buildAnimation(
  screens: number | number[],
  frames: string[], // base64 JPEG per frame
  speedMs: number,
): Command[] {
  const mask = lcdMask(screens);
  const id = nextPicId();
  return frames.map((picData, picOffset) =>
    sendHttpGifFrame({
      mask,
      picNum: frames.length,
      picOffset,
      picId: id,
      picSpeed: speedMs,
      picData,
    }),
  );
}

/** Text overlay. Must run AFTER a SendHttpGif on that screen. TextWidth 17..63. */
export function sendHttpText(opts: {
  lcdIndex: number;
  text: string;
  x?: number;
  y?: number;
  color?: string;
  font?: number;
  width?: number;
  speed?: number;
  dir?: 0 | 1;
  textId?: number;
  align?: 1 | 3 | 5;
}): Command {
  const width = Math.max(17, Math.min(opts.width ?? 56, 63));
  return {
    Command: "Draw/SendHttpText",
    // Firmware is inconsistent about the field name for the target screen:
    // API docs say LcdIndex, but working apps (adiastra) use LcdId. Send both.
    LcdIndex: opts.lcdIndex,
    LcdId: opts.lcdIndex,
    TextId: opts.textId ?? 1,
    x: opts.x ?? 0,
    y: opts.y ?? 52,
    dir: opts.dir ?? 0,
    font: opts.font ?? 4,
    TextWidth: width,
    speed: opts.speed ?? 60,
    TextString: opts.text,
    color: opts.color ?? "#FFFFFF",
    align: opts.align ?? 1,
  };
}

export type ItemListItem = {
  TextId: number;
  type: number; // 1-21 on-device data, 22 static, 23 net-text(URL)
  x: number;
  y: number;
  dir?: 0 | 1;
  font: number;
  TextWidth: number;
  Textheight?: number;
  TextString?: string;
  speed?: number;
  color?: string;
  update_time?: number;
  align?: number; // firmware uses 0-based here (0/1/2), not the 1/3/5 of SendHttpText
};

/** Self-updating item list. NewFlag 1 = set background + items; BackgroudGif URL required then. */
export function sendHttpItemList(opts: {
  lcdIndex: number;
  items: ItemListItem[];
  newFlag?: 0 | 1;
  backgroundGif?: string;
}): Command {
  const cmd: Command = {
    Command: "Draw/SendHttpItemList",
    LcdIndex: opts.lcdIndex,
    NewFlag: opts.newFlag ?? 1,
    ItemList: opts.items,
  };
  if (opts.backgroundGif) cmd.BackgroudGif = opts.backgroundGif;
  return cmd;
}

// Hosted solid background gifs (device fetches these; palette index 0 is an
// unused sentinel so the solid colour isn't treated as transparent).
export const BG_BASE = "https://pixelgate.pages.dev/bg/solid-";
// Pages Function that echoes ?t=<text> as {"DispData": text} for type-23 net-text.
export const ECHO_BASE = "https://pixelgate.pages.dev/api/echo";
export type BgPreset = "dark" | "black" | "navy" | "plum" | "white";

/**
 * Scrolling text / marquee via on-device SendHttpItemList type 23 (net-text).
 * The device polls our echo Function for the text and scrolls it when it
 * overflows TextWidth. font 2 (has letters) at full width.
 */
export function buildScrollingText(
  screens: number | number[],
  opts: { text: string; color: string; bg: BgPreset; speed?: number; y?: number },
): Command[] {
  const list = typeof screens === "number" ? [screens] : screens;
  const bgUrl = `${BG_BASE}${opts.bg}.gif`;
  const url = `${ECHO_BASE}?t=${encodeURIComponent(opts.text)}`;
  return list.map((s) =>
    sendHttpItemList({
      lcdIndex: s,
      newFlag: 1,
      backgroundGif: bgUrl,
      items: [
        {
          TextId: 1,
          type: 23, // net-text: polls the URL, scrolls on overflow
          x: 0,
          y: opts.y ?? 52,
          dir: 0,
          font: 2, // general font with letters (numeral fonts have no A-Z)
          TextWidth: 128, // full-width scroll region
          Textheight: 16,
          speed: opts.speed ?? 30,
          color: opts.color,
          update_time: 60,
          TextString: url,
        },
      ],
    }),
  );
}

// Fonts that actually render on this firmware. Big built-in fonts (242/256/260…)
// silently blank, so the "large" option tops out at font 90.
const CLOCK_FONT = { small: 2, large: 90 } as const;

/**
 * On-device self-updating digital clock (ticks natively, no re-push).
 * HH:MM on top; optional SS stacked smaller below. Position/size/colour are
 * tunable because centring/align is unreliable on this firmware.
 */
export function buildDigitalClock(
  screens: number | number[],
  opts: {
    color: string;
    big: boolean;
    seconds: boolean;
    x: number;
    y: number;
    bg: BgPreset;
  },
): Command[] {
  const list = typeof screens === "number" ? [screens] : screens;
  const bgUrl = `${BG_BASE}${opts.bg}.gif`;
  const font = opts.big ? CLOCK_FONT.large : CLOCK_FONT.small;
  return list.map((s) => {
    const items: ItemListItem[] = [
      {
        TextId: 1,
        type: 5, // HH:MM
        x: opts.x,
        y: opts.y,
        dir: 0,
        font,
        TextWidth: 128,
        Textheight: 16,
        speed: 100,
        color: opts.color,
        update_time: 1,
        align: 0,
      },
    ];
    if (opts.seconds) {
      items.push({
        TextId: 2,
        type: 1, // seconds
        x: opts.x + 17,
        y: opts.y + 30,
        dir: 0,
        font: 2,
        TextWidth: 60,
        Textheight: 16,
        speed: 100,
        color: opts.color,
        update_time: 1,
        align: 0,
      });
    }
    return sendHttpItemList({ lcdIndex: s, newFlag: 1, backgroundGif: bgUrl, items });
  });
}
