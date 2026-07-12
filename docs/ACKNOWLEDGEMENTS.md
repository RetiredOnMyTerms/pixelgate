# Acknowledgements

PixelGate stands on a lot of community reverse-engineering. Thank you to:

- **[averhaegen/hacs-divoom-times-gate-dev](https://github.com/averhaegen/hacs-divoom-times-gate-dev)**
  — the primary Times Gate (Hardware 400) API reference used throughout: the
  `LocalToken` requirement, JPEG `PicData`, monotonic `PicID`, `LcdArray`/`LcdIndex`
  targeting, the self-updating `SendHttpItemList` item types, and the card /
  `dispdata` device-pull pattern (`docs/API.md`, `DISPDATA.md`, `CARDS.md`, `FONTS.md`).
- **[4ch1m/pixoo-rest](https://github.com/4ch1m/pixoo-rest)** — REST-wrapper design ideas for a local device proxy.
- **[r12f/divoom](https://github.com/r12f/divoom)** (divoom-gateway) — Rust device library and local gateway reference.
- **[Grayda/pixoo_api](https://github.com/Grayda/pixoo_api)** — the plain-English `NOTES.md` on API quirks.
- **[REvoom Team](https://divoom.2a03.party/)** — reverse-engineered documentation of Divoom's cloud endpoints.
- **[SomethingWithComputers/pixoo](https://pypi.org/project/pixoo/)** — the `pixoo` Python library and its designer concept.
- **[adiastra/divoom-gaming-gate](https://github.com/adiastra/divoom-gaming-gate)** — an early Times-Gate-specific Python pusher.
- **Divoom** — for the device and the (sparse) official docs at [doc.divoom-gz.com](https://doc.divoom-gz.com).

PixelGate is unofficial and not affiliated with any of the above. All trademarks
belong to their respective owners.
