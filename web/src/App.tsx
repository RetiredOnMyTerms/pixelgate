import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
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
  resetHttpGifId,
  resetPicIdCounter,
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
} from "./lib/render";

const APP_VERSION = "0.4.2";

type TemplateId = "solid" | "digital" | "ball" | "image" | "text";
const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "digital", label: "Digital clock" },
  { id: "text", label: "Text / marquee" },
  { id: "ball", label: "Newton's cradle" },
  { id: "image", label: "Image upload" },
  { id: "solid", label: "Solid colour" },
];

async function framesToB64(canvases: HTMLCanvasElement[]): Promise<string[]> {
  return Promise.all(canvases.map((c) => canvasToJpegBase64(c)));
}

const BG_PRESET_HEX: Record<BgPreset, string> = {
  dark: "#05070F",
  black: "#000000",
  navy: "#0A1030",
  plum: "#1A081E",
  white: "#F0F0F0",
};

export default function App() {
  const [cfg, setCfg] = useState<Config>(loadConfig());
  const [bridge, setBridge] = useState<BridgeStatus>({ ok: false, error: "not checked" });
  const [screens, setScreens] = useState<number[]>([0]);
  const [template, setTemplate] = useState<TemplateId>("digital");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Friendly | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<Friendly | null>(null);
  const [verifying, setVerifying] = useState(false);

  // template params
  const [solidColor, setSolidColor] = useState("#00C8FF");
  const [textValue, setTextValue] = useState("HELLO TIMES GATE");
  const [textColor, setTextColor] = useState("#00E5FF");
  const [textBg, setTextBg] = useState<BgPreset>("dark");
  const [seconds, setSeconds] = useState(true);
  const [imageCanvas, setImageCanvas] = useState<HTMLCanvasElement | null>(null);
  // digital clock (on-device) tuning
  const [clockBig, setClockBig] = useState(true);
  const [clockX, setClockX] = useState(39);
  const [clockY, setClockY] = useState(32);
  const [clockBg, setClockBg] = useState<BgPreset>("dark");
  const [cradleRandom, setCradleRandom] = useState(false);

  const previewRef = useRef<HTMLCanvasElement>(null);

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

  // Build the preview frame (first frame of the current template).
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
    }
  }, [template, solidColor, textColor, textValue, seconds, imageCanvas, clockBg, textBg]);

  // Repaint preview whenever inputs change.
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

  // Build the command list to send for the current template.
  const buildCommands = useCallback(async (): Promise<Command[]> => {
    // Digital clock is on-device self-updating (ItemList) — not a JPEG push.
    if (template === "digital") {
      return buildDigitalClock(screens, {
        color: textColor,
        big: clockBig,
        stacked: seconds,
        x: clockX,
        y: clockY,
        bg: clockBg,
      });
    }
    // Scrolling text is on-device (ItemList type 23 via our echo Function).
    if (template === "text") {
      return buildScrollingText(screens, { text: textValue, color: textColor, bg: textBg });
    }
    const cmds: Command[] = [resetHttpGifId()];
    resetPicIdCounter();
    // Newton's cradle: when all 5 screens are selected, one sphere per screen
    // spans the device; otherwise a full 5-ball cradle on each chosen screen.
    if (template === "ball") {
      const numSwing = cradleRandom ? (Math.random() < 0.5 ? 1 : 2) : 1;
      if (screens.length === SCREEN_COUNT) {
        for (let i = 0; i < SCREEN_COUNT; i++) {
          const b64 = await framesToB64(renderCradleScreen(i, 40, { numSwing }));
          cmds.push(...buildAnimation(i, b64, 45));
        }
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
      default:
        canvases = [renderSolid("#000000")];
    }
    const b64 = await framesToB64(canvases);
    cmds.push(...buildAnimation(screens, b64, speed));
    return cmds;
  }, [
    template, screens, solidColor, textColor, textValue, seconds,
    imageCanvas, clockBig, clockX, clockY, clockBg, textBg, cradleRandom,
  ]);

  // Core push, shared by the manual Send button and the live re-push tick.
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
    const shown = screens.map((s) => s + 1); // screens are 0-based internally, 1-based in UI
    const label = shown.length > 1 ? `screens ${shown.join(", ")}` : `screen ${shown[0]}`;
    return friendly(r, `Sent — ${label} updated. ✓`);
  }, [cfg, bridge, buildCommands, screens]);

  const send = useCallback(async () => {
    setReply(null);
    setScript(null);
    if (!cfg.deviceIp)
      return setReply({ ok: false, msg: "Enter your device IP first (or click Discover)." });
    if (!cfg.localToken)
      return setReply({
        ok: false,
        msg: 'Enter your LocalToken first — see "Where do I find my LocalToken?"',
      });
    setBusy(true);
    try {
      setReply(await doPush());
    } catch {
      setReply({
        ok: false,
        msg: "Couldn't reach the local bridge — make sure it's running on your machine.",
      });
    } finally {
      setBusy(false);
    }
  }, [cfg, doPush]);

  const verify = useCallback(async () => {
    setVerifyMsg(null);
    if (!cfg.deviceIp) return setVerifyMsg({ ok: false, msg: "Enter your device IP first." });
    if (!cfg.localToken) return setVerifyMsg({ ok: false, msg: "Enter your LocalToken first." });
    if (!bridge.ok)
      return setVerifyMsg({ ok: false, msg: "Start the local bridge first, then verify." });
    setVerifying(true);
    try {
      setVerifyMsg(await verifyConnection(cfg.bridgePort, cfg.deviceIp, Number(cfg.localToken)));
    } finally {
      setVerifying(false);
    }
  }, [cfg, bridge]);

  const toggleScreen = (i: number) =>
    setScreens((prev) =>
      prev.includes(i) ? prev.filter((s) => s !== i) : [...prev, i].sort(),
    );

  const runDiscover = async () => {
    setVerifyMsg(null);
    if (!bridge.ok)
      return setVerifyMsg({ ok: false, msg: "Start the local bridge first, then Discover." });
    try {
      const d = (await discover(cfg.bridgePort)) as {
        DeviceList?: { DevicePrivateIP: string; DeviceName: string }[];
      };
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

  return (
    <div className="app">
      <header>
        <h1>
          PixelGate <span className="badge">unofficial</span>
        </h1>
        <p className="sub">
          Design and push visuals to a{" "}
          <a href="https://divoom.com/products/time-gate" target="_blank" rel="noopener noreferrer">
            Divoom Times Gate
          </a>
          . Not affiliated with Divoom — use at your own risk. v{APP_VERSION}
        </p>
      </header>

      <section className="panel">
        <h2>1. Connect</h2>
        <div className="row">
          <label>
            Device IP
            <input
              value={cfg.deviceIp}
              placeholder="192.168.x.x"
              onChange={(e) => persist({ ...cfg, deviceIp: e.target.value })}
            />
          </label>
          <label>
            LocalToken
            <input
              value={cfg.localToken}
              placeholder="from Divoom app"
              onChange={(e) => persist({ ...cfg, localToken: e.target.value })}
            />
          </label>
          <label>
            Bridge port
            <input
              type="number"
              value={cfg.bridgePort}
              onChange={(e) =>
                persist({ ...cfg, bridgePort: Number(e.target.value) || 7660 })
              }
            />
          </label>
        </div>
        <div className="row">
          <button onClick={checkBridge}>Check bridge</button>
          <button onClick={runDiscover}>Discover device</button>
          <button className="verify" onClick={verify} disabled={verifying}>
            {verifying ? "Verifying…" : "Verify connection"}
          </button>
          <span className={bridge.ok ? "ok" : "bad"}>
            {bridge.ok
              ? `bridge up (v${bridge.version})`
              : `bridge not detected — start it on your machine to push live.`}
          </span>
        </div>
        {verifyMsg && (
          <p className={verifyMsg.ok ? "msg ok" : "msg bad"}>{verifyMsg.msg}</p>
        )}
        <button className="link" onClick={() => setShowHelp((v) => !v)}>
          {showHelp ? "Hide help" : "Where do I find my LocalToken?"}
        </button>
        {showHelp && (
          <div className="help">
            <p>
              The LocalToken is a short number shown in the Divoom phone app. Follow
              these three steps, then paste it into the LocalToken box above.
            </p>
            <div className="help-steps">
              {[
                { n: 1, img: "step1.jpg", cap: "Tap your Times Gate device" },
                { n: 2, img: "step2.jpg", cap: "Open its Settings" },
                { n: 3, img: "step3.jpg", cap: "Copy the Local Token" },
              ].map((s) => (
                <figure key={s.n}>
                  <img src={`${import.meta.env.BASE_URL}onboarding/${s.img}`} alt={s.cap} />
                  <figcaption>
                    {s.n}. {s.cap}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>2. Screens</h2>
        <div className="screens">
          {Array.from({ length: SCREEN_COUNT }, (_, i) => (
            <button
              key={i}
              className={screens.includes(i) ? "screen on" : "screen"}
              onClick={() => toggleScreen(i)}
            >
              {i + 1}
            </button>
          ))}
          <button onClick={() => setScreens([0, 1, 2, 3, 4])}>All</button>
        </div>
      </section>

      <section className="panel">
        <h2>3. Template</h2>
        <div className="templates">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className={template === t.id ? "tmpl on" : "tmpl"}
              onClick={() => setTemplate(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="controls">
          {template === "solid" && (
            <label>
              Colour
              <input type="color" value={solidColor} onChange={(e) => setSolidColor(e.target.value)} />
            </label>
          )}
          {template === "digital" && (
            <>
              <label>
                Colour
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
              </label>
              <label>
                Background
                <select value={clockBg} onChange={(e) => setClockBg(e.target.value as BgPreset)}>
                  <option value="dark">Dark</option>
                  <option value="black">Black</option>
                  <option value="navy">Navy</option>
                  <option value="plum">Plum</option>
                  <option value="white">White</option>
                </select>
              </label>
              <label>
                Size
                <select value={clockBig ? "large" : "small"} onChange={(e) => setClockBig(e.target.value === "large")}>
                  <option value="large">Large</option>
                  <option value="small">Small</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={seconds} onChange={(e) => setSeconds(e.target.checked)} />
                seconds (stacked below)
              </label>
              <label>
                X {clockX}
                <input type="range" min={0} max={100} value={clockX} onChange={(e) => setClockX(Number(e.target.value))} />
              </label>
              <label>
                Y {clockY}
                <input type="range" min={0} max={100} value={clockY} onChange={(e) => setClockY(Number(e.target.value))} />
              </label>
              <span className="hint">Ticks on-device — one send, no re-push. Nudge X/Y to centre.</span>
            </>
          )}
          {template === "text" && (
            <>
              <label className="grow">
                Message
                <input value={textValue} onChange={(e) => setTextValue(e.target.value)} />
              </label>
              <label>
                Colour
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
              </label>
              <label>
                Background
                <select value={textBg} onChange={(e) => setTextBg(e.target.value as BgPreset)}>
                  <option value="dark">Dark</option>
                  <option value="black">Black</option>
                  <option value="navy">Navy</option>
                  <option value="plum">Plum</option>
                  <option value="white">White</option>
                </select>
              </label>
              <span className="hint">Scrolls on-device when longer than the screen. Ticks itself — no re-push.</span>
            </>
          )}
          {template === "image" && (
            <label>
              Image file
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setImageCanvas(await imageFileToCanvas(f));
                }}
              />
            </label>
          )}
          {template === "ball" && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={cradleRandom}
                  onChange={(e) => setCradleRandom(e.target.checked)}
                />
                randomize (vary how many spheres swing)
              </label>
              <span className="hint">
                Pick <b>All</b> screens for one sphere per screen — a cradle across the whole device.
              </span>
            </>
          )}
        </div>
      </section>

      <section className="panel preview-panel">
        <h2>4. Preview & send</h2>
        <div className="preview-wrap">
          <canvas ref={previewRef} width={128} height={128} className="preview" />
          <div className="send-col">
            <button className="send" disabled={busy || !screens.length} onClick={send}>
              {busy
                ? "Sending…"
                : `Send to screen ${screens.map((s) => s + 1).join(",")}`}
            </button>
            {reply !== null && (
              <p className={reply.ok ? "msg ok" : "msg bad"}>{reply.msg}</p>
            )}
          </div>
        </div>
        {script && (
          <div className="script">
            <p>
              Bridge not running — copy this script and run it locally
              (<code>python pixelgate_send.py</code>):
            </p>
            <textarea readOnly value={script} rows={12} />
          </div>
        )}
      </section>
    </div>
  );
}
