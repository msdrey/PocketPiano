# PocketPiano

An interactive web-based piano that runs in the browser. No frameworks, no build step — just HTML, CSS, and vanilla JavaScript.

**[Live Demo](https://fluffy-belekoy-72e663.netlify.app/)**

![QR Code](https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://fluffy-belekoy-72e663.netlify.app/)

## Features

- 49-key keyboard (C2–C6)
- Realistic sound via Web Audio API additive synthesis
- Mouse and multi-touch support
- Scrollable keyboard with a slider control
- Volume control
- Transpose control (shift pitch up/down)
- Per-deploy PR badge
- PWA support — installable and works offline
- Fully responsive layout (portrait and landscape)

## Getting Started

No build step required. Just serve the files locally:

```bash
npx http-server
# or
python -m http.server 8000
```

Then open `http://localhost:8000` in any modern browser.

Install dev dependencies (only needed for tests):

```bash
npm install
```

## Running Tests

```bash
npm test
```

## Project Structure

```
PocketPiano/
├── index.html
├── style.css
├── scripts/
│   └── gen-pr.js       # Generates pr.json for the PR badge on Netlify deploys
└── src/
    ├── audio.js        # Web Audio synthesis and note playback
    ├── audio.test.js
    ├── keyboard.js     # Keyboard DOM and touch/mouse event handling
    ├── keyboard.test.js
    ├── transpose.js    # Transpose controls (pitch shift up/down)
    ├── transpose.test.js
    ├── volume.js       # Volume control
    ├── volume.test.js
    ├── serviceWorker.js # PWA service worker
    └── serviceWorker.test.js
```

## PWA & Offline Support

PocketPiano is a Progressive Web App (PWA). It can be installed to the home screen on mobile and desktop, and it works fully offline after the first visit.

### Why a service worker?

A piano needs to be instantly responsive — any latency between a key press and sound is noticeable. On mobile browsers especially, a network round-trip on first load (or when the connection is flaky) would cause audio to stutter or the app to fail entirely. The service worker solves this by pre-caching all app assets on install, so subsequent loads are served straight from the local cache with zero network dependency.

The strategy used is **network-first**: when online the browser always fetches the latest version and updates the cache; when offline it falls back to whatever was cached. This means you never see a stale version while connected, but the app still works on a plane or underground.

## Tech Stack

- Vanilla JavaScript (ES6 modules)
- Web Audio API
- Vitest + jsdom for testing
- Netlify for hosting (with per-deploy PR badge via `scripts/gen-pr.js`)
