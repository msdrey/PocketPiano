import { playNote, stopNote } from './audio.js';

// ── Keyboard layout ────────────────────────────────────────────────────────────
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const START = 36, END = 84, WHITE_W = 52;

function noteName(m) { return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }
function isBlack(m)  { return [1, 3, 6, 8, 10].includes(m % 12); }

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
  document.getElementById('keyboardScroll').scrollLeft = 7 * WHITE_W - 20;
}

// ── Press / release ────────────────────────────────────────────────────────────
const pressed = new Set();

function press(midi) {
  if (pressed.has(midi)) return;
  pressed.add(midi);
  playNote(midi);
  document.querySelector(`[data-midi="${midi}"]`)?.classList.add('pressed');
}

function release(midi) {
  if (!pressed.has(midi)) return;
  pressed.delete(midi);
  stopNote(midi);
  document.querySelector(`[data-midi="${midi}"]`)?.classList.remove('pressed');
}

function keyAt(x, y) {
  for (const el of document.querySelectorAll('.key-black')) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return +el.dataset.midi;
  }
  for (const el of document.querySelectorAll('.key-white')) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return +el.dataset.midi;
  }
  return null;
}

// ── Touch events ───────────────────────────────────────────────────────────────
const touchMap = {};

document.addEventListener('touchstart', e => {
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
