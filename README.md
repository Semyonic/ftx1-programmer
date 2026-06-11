# FTX-1 Programmer

Web-based memory and settings programmer for the Yaesu FTX-1 series transceiver, using CAT commands over [Web Serial](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API). Runs entirely in the browser — no installation, no native drivers, nothing leaves your machine.

**Live app:** https://semyonic.github.io/ftx1-programmer/

## Features

- Read and write memory channels (1–999) via CAT
- Quick control of frequency, mode, and common settings
- Import/export: CSV, ADMS-14 CSV, FT5D `.dat`, JSON
- Menu settings browser with descriptions
- Serial debug console

## Requirements

- A Chromium-based desktop browser (Chrome, Edge, Opera). Firefox and Safari do not support Web Serial.
- Yaesu FTX-1 connected via USB (CAT serial port).

## Development

```sh
npm install
npm run dev        # start dev server
npm test           # run vitest suite
npm run typecheck  # tsc --noEmit
npm run build      # production build to dist/
```

Deployment to GitHub Pages happens automatically on push to `main` via GitHub Actions (tests must pass first).

## Disclaimer

This is an unofficial hobby project, not affiliated with or endorsed by Yaesu. Writing memories or settings to your radio is done at your own risk — back up your radio's configuration first.

## License

Copyright (c) 2026 Semih Onay (TA1SMO).

This project is licensed under the GNU General Public License v3.0 — see the [LICENSE](LICENSE) file for details.
