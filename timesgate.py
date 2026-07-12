"""Minimal Divoom Times Gate client (5x 128x128 LCD screens, Hardware 400).

Firmware gotchas (learned the hard way — see README):
  * EVERY /post request must carry an integer ``LocalToken`` (shown in the Divoom
    phone app). Without it every command returns ``{"error_code": "DeviceToken is err"}``.
  * ``Draw/SendHttpGif`` ``PicData`` must be base64 **JPEG** (q~95), NOT raw RGB.
    Raw RGB returns error_code 0 but leaves the screen stuck on "loading".
  * ``PicID`` must be a SMALL, strictly-increasing counter (1,2,3,...). Using a
    unix timestamp -> stuck "loading". Reusing/lowering an id -> send ignored.
    Call ``Draw/ResetHttpGifId`` once at startup, then use the shared counter.
  * Drawing commands select screens with ``LcdArray`` (length-5 0/1 mask).
    Per-screen commands (text) use ``LcdIndex`` (single int 0-4).
"""

import base64
import io
import itertools

import requests
from PIL import Image

SCREEN_COUNT = 5
IMG_SIZE = 128


class TimesGate:
    def __init__(self, ip, local_token, timeout=8):
        self.ip = ip.strip()
        self.local_token = int(local_token)
        self.timeout = timeout
        self.url = f"http://{self.ip}/post"
        # shared, monotonic PicID counter across all screens
        self._pic_id = itertools.count(1)

    # --- low level -------------------------------------------------------
    def post(self, command, retries=2):
        """POST with LocalToken injected. Retries transient timeouts — the device
        drops its HTTP server briefly under load / WiFi power-save."""
        payload = {**command, "LocalToken": self.local_token}
        for attempt in range(retries + 1):
            try:
                r = requests.post(self.url, json=payload, timeout=self.timeout)
                r.raise_for_status()
                try:
                    return r.json()
                except ValueError:
                    return {"raw": r.text}
            except (requests.Timeout, requests.ConnectionError):
                if attempt == retries:
                    raise

    def check(self):
        """True if the device accepts our LocalToken."""
        resp = self.post({"Command": "Device/GetDeviceTime"})
        return "error_code" not in resp or resp.get("error_code") in (0, "0")

    def reset_gif_id(self):
        """Reset device PicID counter; call once before a fresh drawing session."""
        self._pic_id = itertools.count(1)
        return self.post({"Command": "Draw/ResetHttpGifId"})

    # --- helpers ---------------------------------------------------------
    @staticmethod
    def lcd_mask(screens):
        """int or iterable of 0-based indices -> length-5 0/1 mask."""
        if isinstance(screens, int):
            screens = [screens]
        mask = [0] * SCREEN_COUNT
        for s in screens:
            mask[s] = 1
        return mask

    @staticmethod
    def _encode(img, quality=95):
        img = img.convert("RGB")
        if img.size != (IMG_SIZE, IMG_SIZE):
            img = img.resize((IMG_SIZE, IMG_SIZE))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        return base64.b64encode(buf.getvalue()).decode()

    # --- drawing ---------------------------------------------------------
    def send_frames(self, screens, frames, speed=100, quality=95):
        """Push PIL.Image frames to screen(s). speed = ms/frame. Max 59 frames."""
        if not frames:
            raise ValueError("no frames")
        if len(frames) >= 60:
            raise ValueError("PicNum must be < 60")
        mask = self.lcd_mask(screens)
        pic_id = next(self._pic_id)
        n = len(frames)
        last = None
        for offset, frame in enumerate(frames):
            last = self.post({
                "Command": "Draw/SendHttpGif",
                "LcdArray": mask,
                "PicNum": n,
                "PicWidth": IMG_SIZE,
                "PicOffset": offset,
                "PicID": pic_id,
                "PicSpeed": speed,
                "PicData": self._encode(frame, quality),
            })
        return last

    def send_image(self, screens, img, quality=95):
        return self.send_frames(screens, [img], quality=quality)

    def send_text(self, screen_index, text, x=0, y=52, color="#FFFFFF",
                  font=4, width=56, speed=60, direction=0, text_id=1, align=1):
        """Overlay text on a screen. Must run AFTER a SendHttpGif on that screen.
        Uses LcdIndex (single int) = the screen that already has a gif.
        TextWidth must be >16 and <64 (>=64 -> "Request data illegal json").
        Text scrolls automatically when longer than TextWidth. font: even ids
        only (2,4,18,20,...); align 1=left 3=middle 5=right; TextId unique <20."""
        width = max(17, min(int(width), 63))
        return self.post({
            "Command": "Draw/SendHttpText",
            "LcdIndex": int(screen_index),
            "TextId": text_id,
            "x": x, "y": y,
            "dir": direction,          # 0 = scroll left, 1 = scroll right
            "font": font,
            "TextWidth": width,
            "speed": speed,
            "TextString": text,
            "color": color,
            "align": align,
        })


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        sys.exit("usage: python timesgate.py <ip> <LocalToken> [screen]")
    ip, token = sys.argv[1], sys.argv[2]
    screen = int(sys.argv[3]) if len(sys.argv) > 3 else 0

    gate = TimesGate(ip, token)
    print("token accepted:", gate.check())
    print("reset id:", gate.reset_gif_id())

    img = Image.new("RGB", (IMG_SIZE, IMG_SIZE), (200, 30, 30))
    print("sending solid red to screen", screen, "->", gate.send_image(screen, img))
