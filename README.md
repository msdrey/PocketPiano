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

## Installing the App (PWA)

You can install PocketPiano to your home screen for a full-screen, offline experience.

### iPhone / iPad (Safari)

1. Open the [live link](https://fluffy-belekoy-72e663.netlify.app/) in **Safari** (other browsers on iOS don't support PWA install).
2. Tap the **Share** button (the box with an arrow pointing up) at the bottom of the screen.
3. Scroll down and tap **Add to Home Screen**.
4. Edit the name if you like, then tap **Add**.
5. The app icon will appear on your home screen. Open it from there for a full-screen experience with no browser chrome.

### Android (Chrome)

1. Open the [live link](https://fluffy-belekoy-72e663.netlify.app/) in **Chrome**.
2. Tap the **three-dot menu** (⋮) in the top-right corner.
3. Tap **Add to Home screen** (or **Install app** if shown as a banner).
4. Confirm by tapping **Add** / **Install**.
5. The app will appear in your app drawer and home screen.

### Desktop (Chrome / Edge)

1. Open the [live link](https://fluffy-belekoy-72e663.netlify.app/) in Chrome or Edge.
2. Click the **install icon** (⊕) in the address bar on the right side.
3. Click **Install** in the prompt.
4. The app opens in its own window and is available from your taskbar / Applications folder.

---

## Tech Stack

- Vanilla JavaScript (ES6 modules)
- Web Audio API
- Vitest + jsdom for testing
- Netlify for hosting (with per-deploy PR badge via `scripts/gen-pr.js`)
