"""Pixel animation toolkit for the Divoom Times Gate.

Each builder returns a list of PIL.Image frames (128x128 RGB) that you push with
TimesGate.send_frames(screen, frames, speed=ms_per_frame).

CLI:
    python animations.py <ip> <LocalToken> <screen> <effect> [args...]
    effects: solid <hexcolor>
             ball                       bouncing ball
             clock                      analog-ish digital clock face (static frame)
             text <string> [hexcolor]   scrolling text via device text overlay

Run `python animations.py <device-ip> <LocalToken> 0 ball` etc.
"""

import math
import sys

from PIL import Image, ImageDraw, ImageFont

from timesgate import TimesGate, IMG_SIZE


def _canvas(bg=(0, 0, 0)):
    return Image.new("RGB", (IMG_SIZE, IMG_SIZE), bg)


def _font(size):
    for name in ("consolab.ttf", "consola.ttf", "arialbd.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


# --- builders ------------------------------------------------------------
def bouncing_ball(frames=30, radius=12, bg=(8, 8, 20),
                  ball=(255, 90, 40), trail=True):
    """Ball bouncing inside the 128x128 box with a little gravity."""
    out = []
    x, y = radius + 4, radius + 4
    vx, vy = 5.0, 0.0
    g = 1.1
    lo, hi = radius, IMG_SIZE - radius
    for _ in range(frames):
        vy += g
        x += vx
        y += vy
        if x < lo:
            x, vx = lo, -vx
        if x > hi:
            x, vx = hi, -vx
        if y > hi:
            y, vy = hi, -vy * 0.86      # damped bounce
        if x < lo or x > hi:
            vx = -vx
        img = _canvas(bg)
        d = ImageDraw.Draw(img)
        if trail:
            d.ellipse([x - radius, y - radius + 6, x + radius, y + radius + 6],
                      fill=(bg[0] + 20, bg[1] + 20, bg[2] + 30))
        d.ellipse([x - radius, y - radius, x + radius, y + radius], fill=ball)
        # specular highlight
        d.ellipse([x - radius / 2, y - radius / 2,
                   x - radius / 6, y - radius / 6], fill=(255, 255, 255))
        out.append(img)
    return out


def clock_face(hour=10, minute=8, second=30, bg=(0, 0, 0),
               face=(20, 24, 40), accent=(0, 200, 255)):
    """Single static analog clock frame. Push as a 1-frame image, refresh per second."""
    img = _canvas(bg)
    d = ImageDraw.Draw(img)
    c = IMG_SIZE // 2
    r = c - 6
    d.ellipse([c - r, c - r, c + r, c + r], fill=face, outline=accent, width=2)
    # hour ticks
    for i in range(12):
        a = math.radians(i * 30 - 90)
        d.line([c + math.cos(a) * (r - 8), c + math.sin(a) * (r - 8),
                c + math.cos(a) * (r - 2), c + math.sin(a) * (r - 2)],
               fill=(120, 130, 160), width=2)

    def hand(frac, length, color, width):
        a = math.radians(frac * 360 - 90)
        d.line([c, c, c + math.cos(a) * length, c + math.sin(a) * length],
               fill=color, width=width)

    hand(((hour % 12) + minute / 60) / 12, r * 0.5, (230, 230, 255), 5)
    hand((minute + second / 60) / 60, r * 0.75, (230, 230, 255), 3)
    hand(second / 60, r * 0.85, accent, 1)
    d.ellipse([c - 3, c - 3, c + 3, c + 3], fill=accent)
    return [img]


def solid(hexcolor="#C81E1E"):
    h = hexcolor.lstrip("#")
    rgb = tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    return [_canvas(rgb)]


# --- CLI -----------------------------------------------------------------
def main():
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    ip, token, screen, effect = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
    gate = TimesGate(ip, token)
    gate.reset_gif_id()

    if effect == "solid":
        color = sys.argv[5] if len(sys.argv) > 5 else "#C81E1E"
        print(gate.send_frames(screen, solid(color), speed=1000))
    elif effect == "ball":
        print(gate.send_frames(screen, bouncing_ball(), speed=45))
    elif effect == "clock":
        import time
        t = time.localtime()
        print(gate.send_frames(screen, clock_face(t.tm_hour, t.tm_min, t.tm_sec),
                               speed=1000))
    elif effect == "text":
        msg = sys.argv[5] if len(sys.argv) > 5 else "HELLO"
        color = sys.argv[6] if len(sys.argv) > 6 else "#00E5FF"
        gate.send_frames(screen, _canvas((0, 0, 20)) and [_canvas((0, 0, 20))],
                         speed=1000)                     # base gif required first
        print(gate.send_text(screen, msg, color=color, speed=60))
    else:
        sys.exit(f"unknown effect: {effect}")


if __name__ == "__main__":
    main()
