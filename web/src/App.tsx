import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { loadConfig, saveConfig, type Config } from "./lib/store";
import {
  detectBridge,
  discover,
  generateScript,
  pushSequence,
  type BridgeStatus,
  type DeviceReply,
} from "./lib/bridge";
import {
  buildAnimation,
  canvasToJpegBase64,
  lcdMask,
  firstActive,
  resetHttpGifId,
  resetPicIdCounter,
  sendHttpText,
  SCREEN_COUNT,
  type Command,
} from "./lib/timesgate";
import {
  imageFileToCanvas,
  renderBall,
  renderClock,
  renderDigital,
  renderSolid,
} from "./lib/render";

const APP_VERSION = "0.3.0";

type TemplateId = "solid" | "clock" | "digital" | "ball" | "image" | "text";
const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "clock", label: "Analog clock" },
  { id: "digital", label: "Digital clock" },
  { id: "text", label: "Text / marquee" },
  { id: "ball", label: "Bouncing ball" },
  { id: "image", label: "Image upload" },
  { id: "solid", label: "Solid colour" },
];

async function framesToB64(canvases: HTMLCanvasElement[]): Promise<string[]> {
  return Promise.all(canvases.map((c) => canvasToJpegBase64(c)));
}

export default function App() {
  const [cfg, setCfg] = useState<Config>(loadConfig());
  const [bridge, setBridge] = useState<BridgeStatus>({ ok: false, error: "not checked" });
  const [screens, setScreens] = useState<number[]>([0]);
  const [template, setTemplate] = useState<TemplateId>("clock");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<DeviceReply | string | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // template params
  const [solidColor, setSolidColor] = useState("#00C8FF");
  const [textValue, setTextValue] = useState("HELLO TIMES GATE");
  const [textColor, setTextColor] = useState("#00E5FF");
  const [bgColor, setBgColor] = useState("#05070F");
  const [seconds, setSeconds] = useState(true);
  const [imageCanvas, setImageCanvas] = useState<HTMLCanvasElement | null>(null);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const liveTimer = useRef<number | null>(null);

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
      case "clock":
        return renderClock(new Date());
      case "digital":
        return renderDigital(new Date(), { bg: bgColor, color: textColor, seconds });
      case "ball":
        return renderBall(30)[0];
      case "image":
        return imageCanvas;
      case "text":
        return renderSolid(bgColor);
    }
  }, [template, solidColor, bgColor, textColor, seconds, imageCanvas]);

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
    const cmds: Command[] = [resetHttpGifId()];
    resetPicIdCounter();
    if (template === "text") {
      const bg = await framesToB64([renderSolid(bgColor)]);
      cmds.push(...buildAnimation(screens, bg, 1000));
      cmds.push(
        sendHttpText({
          lcdIndex: firstActive(lcdMask(screens)),
          text: textValue,
          color: textColor,
          speed: 60,
        }),
      );
      return cmds;
    }
    let canvases: HTMLCanvasElement[];
    let speed = 1000;
    switch (template) {
      case "solid":
        canvases = [renderSolid(solidColor)];
        break;
      case "clock":
        canvases = [renderClock(new Date())];
        break;
      case "digital":
        canvases = [renderDigital(new Date(), { bg: bgColor, color: textColor, seconds })];
        break;
      case "ball":
        canvases = renderBall(30);
        speed = 45;
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
  }, [template, screens, solidColor, bgColor, textColor, textValue, seconds, imageCanvas]);

  const send = useCallback(async () => {
    setReply(null);
    setScript(null);
    if (!cfg.deviceIp) {
      setReply("Set your device IP first.");
      return;
    }
    setBusy(true);
    try {
      const cmds = await buildCommands();
      if (!bridge.ok) {
        // No bridge -> offer the zero-install script instead.
        setScript(generateScript(cfg.deviceIp, Number(cfg.localToken), cmds));
        return;
      }
      const withToken = cmds.map((c) => ({ ...c, LocalToken: Number(cfg.localToken) }));
      const r = await pushSequence(cfg.bridgePort, cfg.deviceIp, withToken);
      setReply(r);
    } catch (e) {
      setReply((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [cfg, bridge, buildCommands]);

  // Live tick for clocks: re-push each second.
  useEffect(() => {
    if (liveTimer.current) {
      clearInterval(liveTimer.current);
      liveTimer.current = null;
    }
    const isClock = template === "clock" || template === "digital";
    if (live && isClock && bridge.ok && cfg.deviceIp) {
      liveTimer.current = window.setInterval(send, 1000);
    }
    return () => {
      if (liveTimer.current) clearInterval(liveTimer.current);
    };
  }, [live, template, bridge.ok, cfg.deviceIp, send]);

  const toggleScreen = (i: number) =>
    setScreens((prev) =>
      prev.includes(i) ? prev.filter((s) => s !== i) : [...prev, i].sort(),
    );

  const runDiscover = async () => {
    setReply(null);
    try {
      const d = (await discover(cfg.bridgePort)) as {
        DeviceList?: { DevicePrivateIP: string; DeviceName: string }[];
      };
      const found = d.DeviceList?.[0];
      if (found) {
        persist({ ...cfg, deviceIp: found.DevicePrivateIP });
        setReply(`Found ${found.DeviceName} at ${found.DevicePrivateIP}`);
      } else {
        setReply("No devices found on this LAN.");
      }
    } catch (e) {
      setReply(`Discover failed (bridge running?): ${(e as Error).message}`);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>
          PixelGate <span className="badge">unofficial</span>
        </h1>
        <p className="sub">
          Design and push visuals to a Divoom Times Gate. Not affiliated with
          Divoom — use at your own risk. v{APP_VERSION}
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
          <span className={bridge.ok ? "ok" : "bad"}>
            {bridge.ok
              ? `bridge up (v${bridge.version})`
              : `bridge not detected — ${bridge.error}. Live push disabled; you can still generate a script.`}
          </span>
        </div>
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
              {i}
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
                Text
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
              </label>
              <label>
                Background
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
              </label>
              <label className="check">
                <input type="checkbox" checked={seconds} onChange={(e) => setSeconds(e.target.checked)} />
                seconds
              </label>
            </>
          )}
          {template === "text" && (
            <>
              <label className="grow">
                Message
                <input value={textValue} onChange={(e) => setTextValue(e.target.value)} />
              </label>
              <label>
                Text
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
              </label>
              <label>
                Background
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
              </label>
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
          {(template === "clock" || template === "digital") && (
            <label className="check">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              live (re-push every second)
            </label>
          )}
        </div>
      </section>

      <section className="panel preview-panel">
        <h2>4. Preview & send</h2>
        <div className="preview-wrap">
          <canvas ref={previewRef} width={128} height={128} className="preview" />
          <div className="send-col">
            <button className="send" disabled={busy || !screens.length} onClick={send}>
              {busy ? "Sending…" : `Send to screen ${screens.join(",")}`}
            </button>
            {reply !== null && (
              <pre className="reply">
                {typeof reply === "string" ? reply : JSON.stringify(reply)}
              </pre>
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
