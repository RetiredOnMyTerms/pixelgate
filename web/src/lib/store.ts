// Persisted connection config. Lives ONLY in the browser (localStorage) — the
// LocalToken never touches any cloud host.

export type Config = {
  deviceIp: string;
  localToken: string; // kept as string in the form; parsed to int when sent
  bridgePort: number;
};

const KEY = "pixelgate.config";

const DEFAULT: Config = { deviceIp: "", localToken: "", bridgePort: 7660 };

export function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveConfig(cfg: Config) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}
