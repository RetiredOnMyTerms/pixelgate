# Contributing to PixelGate

Thanks for your interest! PixelGate is an **unofficial** community tool for the
Divoom Times Gate. Contributions — bug reports, fixes, and features — are welcome.

> Not affiliated with, endorsed by, or supported by Divoom.

## Architecture (read this first)

```
Cloudflare Pages (web app)  ──▶  local bridge 127.0.0.1  ──▶  Times Gate (LAN)
```

- **`web/`** — the app: Vite + React + TypeScript, styled with Radix Themes.
- **`bridge/`** — a tiny FastAPI server on `127.0.0.1`. It exists because a hosted
  HTTPS page can't talk to the device directly: the Times Gate is HTTP-only on a
  private LAN IP and sends no CORS headers, so the browser can't reach it. The
  bridge relays commands and adds the missing CORS headers.
- **`web/functions/`** — Cloudflare Pages Functions (keyless proxies, e.g. the
  marquee text echo and the airline-logo proxy).
- **`timesgate.py` / `animations.py`** — Python device client + standalone CLI.

## Local development

Prereqs: **Node 20+** and **Python 3.10+**.

```bash
git clone https://github.com/RetiredOnMyTerms/pixelgate
cd pixelgate

# Bridge (Terminal A)
pip install -r bridge/requirements.txt
python bridge/app.py                 # http://127.0.0.1:7660

# Web app (Terminal B)
cd web && npm install && npm run dev  # http://localhost:5173
```

### Developing without hardware

You don't need a Times Gate to work on most things — the in-browser **preview
canvases render without a device**. You only need a real device + its LocalToken
to actually *push* frames.

Data sources:
- **Sports scoreboard** uses ESPN's keyless public API (fetched client-side).
- **Flight tracker** uses AviationStack, which needs a **personal free API key**;
  it's entered in the UI and kept in the browser (localStorage) — never in code.

## Standards

- **TypeScript must pass:** `cd web && npx tsc --noEmit` (and `npm run build`).
- **Match the existing style** — small, focused changes; keep the file's idioms.
- **Version + changelog:** bump the version (semver) and add a `CHANGELOG.md`
  entry per change set. Version sources must agree: `web/src/App.tsx`
  (`APP_VERSION`), `bridge/app.py` (`VERSION`), `README.md`, and the changelog top.
- **Never commit secrets.** No API keys, tokens, or device LocalTokens in source,
  fixtures, or committed screenshots. `.env.secrets.local` is gitignored; local
  device IP / LocalToken live only in the browser.

## Pull requests

1. Fork, branch off `main`, make your change.
2. Run `npx tsc --noEmit` and `npm run build` in `web/`.
3. Update `CHANGELOG.md` and bump the version.
4. Open a PR describing what changed and how you tested it (against a real device
   where possible, or note that you couldn't).

## Reporting bugs

Open an issue with the device firmware/hardware model, your browser, whether the
bridge was running, and the exact steps — those are the usual culprits. See the
issue templates.
