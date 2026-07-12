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
    LcdIndex: opts.lcdIndex,
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
  align?: 1 | 3 | 5;
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
