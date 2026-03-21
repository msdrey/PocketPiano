# PocketPiano

An interactive web-based piano that runs in the browser. No frameworks, no build step — just HTML, CSS, and vanilla JavaScript.

**[Live Demo](https://msdrey.github.io/PocketPiano/)**

## Features

- 49-key keyboard (C2–C6)
- Realistic sound via Web Audio API additive synthesis
- Mouse and multi-touch support
- Scrollable keyboard with a slider control
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
└── src/
    ├── audio.js        # Web Audio synthesis and note playback
    ├── audio.test.js
    ├── keyboard.js     # Keyboard DOM and touch/mouse event handling
    └── keyboard.test.js
```

## Tech Stack

- Vanilla JavaScript (ES6 modules)
- Web Audio API
- Vitest + jsdom for testing
- GitHub Pages for hosting
