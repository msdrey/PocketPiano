import { getTranspose } from './transpose.js';
import { playNote, stopNote, primeAudio } from './audio.js';

// ── Quarter-tone constants ─────────────────────────────────────────────────────
const START = 36, END = 84, WHITE_W = 47;
const BLACK_MODS = new Set([1, 3, 6, 8, 10]);

let enabled = false;

export function isQuarterToneEnabled() { return enabled; }

// ── Center-position map ────────────────────────────────────────────────────────
// Returns a map from integer MIDI value → x-center-px (relative to .keyboard left)
// matching the exact positioning logic in buildKeyboard().
function buildCenterMap() {
  const centers = {};

  // First pass: index white keys
  let wIdx = 0;
  const midiToWIdx = {};
  for (let m = START; m <= END; m++) {
    if (!BLACK_MODS.has(m % 12)) {
      midiToWIdx[m] = wIdx;
      // White key element starts at 12 + wIdx*WHITE_W (keyboard left-padding=12)
      centers[m] = 12 + wIdx * WHITE_W + WHITE_W / 2;
      wIdx++;
    }
  }

  // Second pass: position black keys
  for (let m = START; m <= END; m++) {
    if (BLACK_MODS.has(m % 12)) {
      const li = midiToWIdx[m - 1];
      if (li !== undefined) {
        // Matches: el.style.left = (12 + li * WHITE_W + WHITE_W + 1) + 'px'
        // with transform:translateX(-50%), so center === that left value
        centers[m] = 12 + li * WHITE_W + WHITE_W + 1;
      }
    }
  }

  return centers;
}

// ── DOM construction ───────────────────────────────────────────────────────────
export function buildQuarterToneLayer() {
  const layer = document.getElementById('quarterToneLayer');
  layer.innerHTML = '';

  const centers = buildCenterMap();

  for (let m = START; m < END; m++) {
    if (centers[m] === undefined || centers[m + 1] === undefined) continue;

    const qtMidi = m + 0.5;
    const centerX = (centers[m] + centers[m + 1]) / 2;

    const el = document.createElement('div');
    el.className = 'key-qt';
    el.dataset.midi = qtMidi;
    el.style.left = centerX + 'px';

    // ‡ = quarter-sharp of a natural note; ♯ = quarter-sharp of a sharp note
    const lbl = document.createElement('span');
    lbl.className = 'key-qt-label';
    lbl.textContent = BLACK_MODS.has(m % 12) ? '♯' : '‡';
    el.appendChild(lbl);

    layer.appendChild(el);
  }
}

// ── Press / release (quarter-tone keys carry their own press state) ────────────
const qtPressed = new Map();

export function pressQt(midi) {
  if (qtPressed.has(midi)) return;
  const playedMidi = midi + getTranspose();
  qtPressed.set(midi, playedMidi);
  playNote(playedMidi);
  document.querySelector(`[data-midi="${midi}"]`)?.classList.add('pressed');
}

export function releaseQt(midi) {
  if (!qtPressed.has(midi)) return;
  const playedMidi = qtPressed.get(midi);
  qtPressed.delete(midi);
  stopNote(playedMidi);
  document.querySelector(`[data-midi="${midi}"]`)?.classList.remove('pressed');
}

// ── Enable / disable ───────────────────────────────────────────────────────────
export function enableQuarterTone() {
  enabled = true;
  buildQuarterToneLayer();
  document.getElementById('quarterToneLayer').style.display = 'block';
  const btn = document.getElementById('qtToggle');
  btn.classList.add('active');
  btn.setAttribute('aria-pressed', 'true');
}

export function disableQuarterTone() {
  enabled = false;
  // Release any held quarter-tone notes before hiding
  for (const [midi, played] of qtPressed) {
    stopNote(played);
    document.querySelector(`[data-midi="${midi}"]`)?.classList.remove('pressed');
  }
  qtPressed.clear();
  const layer = document.getElementById('quarterToneLayer');
  layer.style.display = 'none';
  layer.innerHTML = ''; // remove key nodes so keyAt() never gets false hits from display:none zero-rects
  const btn = document.getElementById('qtToggle');
  btn.classList.remove('active');
  btn.setAttribute('aria-pressed', 'false');
}

// ── Init ───────────────────────────────────────────────────────────────────────
export function initQuarterTone() {
  const btn = document.getElementById('qtToggle');
  btn.addEventListener('click', () => {
    primeAudio(); // prime inside the click gesture so AudioContext is running before first key tap
    if (enabled) disableQuarterTone();
    else enableQuarterTone();
  });

  // Auto-revert when the device rotates to portrait
  const mq = window.matchMedia('(orientation: portrait)');
  const onOrientationChange = e => { if (e.matches && enabled) disableQuarterTone(); };
  mq.addEventListener('change', onOrientationChange);
}
