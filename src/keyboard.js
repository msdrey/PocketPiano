import { playNote, stopNote, primeAudio } from './audio.js';
import { getTranspose } from './transpose.js';
import { pressQt, releaseQt } from './quartertone.js';
import { MIDI_LOW, MIDI_HIGH, WHITE_KEY_WIDTH } from './constants.js';

// ── Keyboard layout ────────────────────────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const START = MIDI_LOW, END = MIDI_HIGH, WHITE_W = WHITE_KEY_WIDTH;
const BLACK_KEY_W = 31; // px — must match .key-black { width } in style.css

export function noteName(m) { return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }
export function isBlack(m)  { return [1, 3, 6, 8, 10].includes(m % 12); }

// Returns true if the MIDI value belongs to a quarter-tone key (fractional)
function isQuarterTone(midi) { return midi % 1 !== 0; }

// ── Column hit-test maps ───────────────────────────────────────────────────────
// Built once in buildKeyboard(). keyAt() resolves white/black key hits in O(1)
// by indexing into typed arrays instead of walking the DOM on every event.
//
// Both maps are indexed by x-pixel relative to the keyboard scroll-content origin.
// whiteColMap[x] = MIDI of the white key whose column includes x (or 0 = none).
// blackColMap[x] = MIDI of the black key whose column includes x (or 0 = none).
let whiteColMap = null;
let blackColMap = null;
let kbScrollEl  = null; // #keyboardScroll element
let kbLeft      = 0;   // scrollEl viewport left, refreshed on resize
let kbTop       = 0;   // scrollEl viewport top,  refreshed on resize
let kbHeight    = Infinity; // scrollEl clientHeight; Infinity in jsdom (clientHeight=0)
// y-distance (from kbTop) below which no black key exists.
// Default 9999 acts as ∞ in jsdom (clientHeight is always 0), so every y value
// is treated as within the black-key zone — correct for testing.
let blackBottom = 9999;

// Refresh cached viewport offsets after a window resize.
// Registered once at module level so multiple buildKeyboard() calls (tests) don't
// pile up duplicate listeners.
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if (!kbScrollEl) return;
    const r = kbScrollEl.getBoundingClientRect();
    kbLeft = r.left;
    kbTop  = r.top;
    const kh = kbScrollEl.clientHeight;
    kbHeight    = kh > 0 ? kh : Infinity;
    blackBottom = kh > 0 ? Math.round(kh * 0.62) : 9999;
  }, { passive: true });
}

function buildColMaps(whiteCount, wIdxMap) {
  kbScrollEl = document.getElementById('keyboardScroll');
  const totalW = whiteCount * WHITE_W + 24; // matches buildKeyboard width calculation

  whiteColMap = new Int16Array(totalW);
  blackColMap = new Int16Array(totalW);

  // White keys: key at index i spans [12 + i*WHITE_W, 12 + (i+1)*WHITE_W)
  let wIdx = 0;
  for (let m = START; m <= END; m++) {
    if (isBlack(m)) continue;
    const xL = 12 + wIdx * WHITE_W;
    for (let x = xL; x < xL + WHITE_W && x < totalW; x++) whiteColMap[x] = m;
    wIdx++;
  }

  // Black keys: CSS positions them with left = (12 + li*WHITE_W + WHITE_W + 1) and
  // transform:translateX(-50%), so the key is centred at that x value.
  const half = Math.floor(BLACK_KEY_W / 2);
  for (let m = START; m <= END; m++) {
    if (!isBlack(m)) continue;
    const li = wIdxMap[m - 1];
    if (li === undefined) continue;
    const cx = 12 + li * WHITE_W + WHITE_W + 1;
    for (let x = Math.max(0, cx - half); x <= Math.min(totalW - 1, cx + half); x++) {
      blackColMap[x] = m;
    }
  }

  // #blackKeysLayer has height:62% in style.css; black keys fill 100% of that layer.
  const kh = kbScrollEl.clientHeight;
  kbHeight    = kh > 0 ? kh : Infinity;
  blackBottom = kh > 0 ? Math.round(kh * 0.62) : 9999;

  const r = kbScrollEl.getBoundingClientRect();
  kbLeft = r.left;
  kbTop  = r.top;
}

export function buildKeyboard() {
  const keyboard  = document.getElementById('keyboard');
  const blackLayer = document.getElementById('blackKeysLayer');

  let whiteCount = 0;
  const midiToWIdx = {};

  for (let m = START; m <= END; m++) {
    if (isBlack(m)) continue;
    midiToWIdx[m] = whiteCount++;
    const el = document.createElement('div');
    el.className = 'key-white';
    el.dataset.midi = m;
    if (m % 12 === 0) {
      const lbl = document.createElement('div');
      lbl.className = 'label';
      lbl.textContent = noteName(m);
      el.appendChild(lbl);
    }
    keyboard.appendChild(el);
  }

  const totalW = whiteCount * WHITE_W + 24;
  keyboard.style.width = totalW + 'px';
  blackLayer.style.width = totalW + 'px';
  document.documentElement.style.setProperty('--keyboard-width', totalW + 'px');

  for (let m = START; m <= END; m++) {
    if (!isBlack(m)) continue;
    const li = midiToWIdx[m - 1];
    if (li === undefined) continue;
    const el = document.createElement('div');
    el.className = 'key-black';
    el.dataset.midi = m;
    el.style.left = (12 + li * WHITE_W + WHITE_W + 1) + 'px';
    blackLayer.appendChild(el);
  }

  // Scroll to C3 on load
  const scrollEl = document.getElementById('keyboardScroll');
  scrollEl.scrollLeft = 7 * WHITE_W - 20;

  // Wire scroll slider
  const slider = document.getElementById('scrollSlider');
  function syncSlider() {
    const max = scrollEl.scrollWidth - scrollEl.clientWidth;
    if (max > 0) slider.value = Math.round((scrollEl.scrollLeft / max) * 1000);
  }
  scrollEl.addEventListener('scroll', syncSlider, { passive: true });
  slider.addEventListener('input', () => {
    const max = scrollEl.scrollWidth - scrollEl.clientWidth;
    scrollEl.scrollLeft = (slider.value / 1000) * max;
  });
  requestAnimationFrame(syncSlider);

  buildColMaps(whiteCount, midiToWIdx);
}

// ── Press / release ────────────────────────────────────────────────────────────
// Map of visual midi → played midi (transpose captured at press time, so release
// always stops the correct note even if transpose changes while the key is held)
const pressed = new Map();

function press(midi) {
  if (isQuarterTone(midi)) { pressQt(midi); return; }
  if (pressed.has(midi)) return;
  const playedMidi = midi + getTranspose();
  pressed.set(midi, playedMidi);
  playNote(playedMidi);
  document.querySelector(`[data-midi="${midi}"]`)?.classList.add('pressed');
}

function release(midi) {
  if (isQuarterTone(midi)) { releaseQt(midi); return; }
  if (!pressed.has(midi)) return;
  const playedMidi = pressed.get(midi);
  pressed.delete(midi);
  stopNote(playedMidi);
  document.querySelector(`[data-midi="${midi}"]`)?.classList.remove('pressed');
}

// ── keyAt — O(1) coordinate → MIDI lookup ─────────────────────────────────────
// Quarter-tone keys remain DOM-based (their layer is rebuilt on every toggle).
// White and black keys use the pre-computed column maps built in buildColMaps().
//
// x, y are viewport coordinates (clientX / clientY).
function keyAt(x, y) {
  for (const el of document.querySelectorAll('.key-qt')) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return +el.dataset.midi;
  }

  if (!whiteColMap) return null;

  // Reject clicks outside the keyboard's vertical bounds (e.g. menu controls above).
  const yRel = y - kbTop;
  if (yRel < 0 || yRel > kbHeight) return null;

  // Convert viewport x → keyboard-content x, accounting for horizontal scroll.
  const xRel = Math.round(x - kbLeft + kbScrollEl.scrollLeft);
  if (xRel < 0 || xRel >= whiteColMap.length) return null;

  // Black keys occupy the top 62 % of the keyboard (#blackKeysLayer height: 62%).
  if (yRel < blackBottom && blackColMap[xRel]) return blackColMap[xRel];

  return whiteColMap[xRel] || null;
}

// ── Touch events ───────────────────────────────────────────────────────────────
const touchMap = {};

document.addEventListener('touchstart', e => {
  primeAudio();
  for (const t of e.changedTouches) {
    const m = keyAt(t.clientX, t.clientY);
    if (m !== null) {
      e.preventDefault(); // blocks iOS magnifier and double-tap zoom on key touches
      touchMap[t.identifier] = m;
      press(m);
    }
  }
}, { passive: false });

document.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    const newM = keyAt(t.clientX, t.clientY);
    const oldM = touchMap[t.identifier];
    if (newM !== oldM) {
      if (oldM !== undefined) release(oldM);
      if (newM !== null) { touchMap[t.identifier] = newM; press(newM); }
      else delete touchMap[t.identifier];
    }
  }
}, { passive: true });

document.addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    if (touchMap[t.identifier] !== undefined) { release(touchMap[t.identifier]); delete touchMap[t.identifier]; }
  }
}, { passive: true });

document.addEventListener('touchcancel', e => {
  for (const t of e.changedTouches) {
    if (touchMap[t.identifier] !== undefined) { release(touchMap[t.identifier]); delete touchMap[t.identifier]; }
  }
}, { passive: true });

// ── Mouse events (desktop) ─────────────────────────────────────────────────────
let mouseHeld = false, mouseMidi = null;

document.addEventListener('mousedown', e => {
  primeAudio();
  mouseHeld = true;
  const m = keyAt(e.clientX, e.clientY);
  if (m !== null) { mouseMidi = m; press(m); }
});

document.addEventListener('mousemove', e => {
  if (!mouseHeld) return;
  const m = keyAt(e.clientX, e.clientY);
  if (m !== mouseMidi) { if (mouseMidi !== null) release(mouseMidi); mouseMidi = m; if (m !== null) press(m); }
});

document.addEventListener('mouseup', () => {
  mouseHeld = false;
  if (mouseMidi !== null) { release(mouseMidi); mouseMidi = null; }
});
