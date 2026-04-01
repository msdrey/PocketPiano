import { playNote, stopNote, primeAudio } from './audio.js';

// ── Patterns ──────────────────────────────────────────────────────────────────
// Each array is semitone offsets from the root note (one note per beat)
const PATTERNS = {
  arpeggio: [0, 4, 7, 12, 7, 4, 0],        // 1–3–5–8–5–3–1
  scale:    [0, 2, 4, 5, 7, 5, 4, 2, 0],   // Do Re Mi Fa Sol Fa Mi Re Do
  triad:    [0, 4, 7, 4, 0],               // 1–3–5–3–1
};

const CHORD_OFFSETS = [0, 4, 7]; // major triad: root, M3, P5

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WARMUP_LOW  = 36; // C2 – lowest selectable note
const WARMUP_HIGH = 72; // C5 – highest selectable note

const BPM_MIN = 40;
const BPM_MAX = 160;
const BPM_STEP = 4;

// ── State ─────────────────────────────────────────────────────────────────────
let lowestMidi  = 48; // C3
let highestMidi = 60; // C4
let patternKey  = 'arpeggio';
let bpm         = 80;

let isPlaying   = false;
let isPaused    = false;

// Sequence of MIDI root notes: ascending then descending arc
let keySequence  = [];
let keyIndex     = 0;

// Current phase within a single key's block
// 'chord1' → play opening chord for 2 beats
// 'pattern' → play pattern notes one per beat
// 'chord2'  → replay chord for 2 beats, then advance key
let phase       = 'chord1';
let patternStep = 0;

// Currently held notes (so we can stop them on the next tick)
let heldNotes = [];

let timerId = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
export function midiLabel(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

/**
 * Build the full ascending + descending arc of MIDI root notes.
 * e.g. low=48, high=51 → [48,49,50,51,50,49,48]
 */
export function buildKeySequence(low, high) {
  const seq = [];
  for (let k = low; k <= high; k++) seq.push(k);
  for (let k = high - 1; k >= low; k--) seq.push(k);
  return seq;
}

export function getPatterns() { return PATTERNS; }

// ── Sequencer ─────────────────────────────────────────────────────────────────
function stopHeld() {
  heldNotes.forEach(m => stopNote(m));
  heldNotes = [];
}

function startNotes(midiArr) {
  midiArr.forEach(m => playNote(m));
  heldNotes = midiArr.slice();
}

function finish() {
  stopHeld();
  isPlaying = false;
  isPaused  = false;
  keyIndex  = 0;
  phase     = 'chord1';
  patternStep = 0;
  updateTransportUI();
}

function tick() {
  if (!isPlaying) return;

  const beatMs = 60000 / bpm;
  const root   = keySequence[keyIndex];

  stopHeld();

  if (phase === 'chord1') {
    startNotes(CHORD_OFFSETS.map(o => root + o));
    phase = 'pattern';
    patternStep = 0;
    timerId = setTimeout(tick, beatMs * 2);

  } else if (phase === 'pattern') {
    const offsets = PATTERNS[patternKey];
    startNotes([root + offsets[patternStep]]);
    patternStep++;
    if (patternStep >= offsets.length) phase = 'chord2';
    timerId = setTimeout(tick, beatMs);

  } else { // chord2
    startNotes(CHORD_OFFSETS.map(o => root + o));
    keyIndex++;
    if (keyIndex >= keySequence.length) {
      // Schedule the stop after the final chord's 2-beat duration
      timerId = setTimeout(finish, beatMs * 2);
    } else {
      phase = 'chord1';
      patternStep = 0;
      timerId = setTimeout(tick, beatMs * 2);
    }
  }
}

// ── Transport ─────────────────────────────────────────────────────────────────
function play() {
  primeAudio();
  if (isPaused) {
    isPlaying = true;
    isPaused  = false;
    updateTransportUI();
    tick();
    return;
  }
  keySequence = buildKeySequence(lowestMidi, highestMidi);
  keyIndex    = 0;
  phase       = 'chord1';
  patternStep = 0;
  isPlaying   = true;
  isPaused    = false;
  updateTransportUI();
  tick();
}

function pause() {
  if (!isPlaying) return;
  clearTimeout(timerId);
  stopHeld();
  isPlaying = false;
  isPaused  = true;
  updateTransportUI();
}

function restart() {
  clearTimeout(timerId);
  stopHeld();
  const wasPlaying = isPlaying || isPaused;
  isPlaying   = false;
  isPaused    = false;
  keyIndex    = 0;
  phase       = 'chord1';
  patternStep = 0;
  if (wasPlaying) {
    // Rebuild sequence in case note range changed between plays
    keySequence = buildKeySequence(lowestMidi, highestMidi);
    isPlaying   = true;
    updateTransportUI();
    tick();
  } else {
    updateTransportUI();
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function updateTransportUI() {
  const btn = document.getElementById('warmupPlayPause');
  if (!btn) return;
  btn.textContent = isPlaying ? '⏸' : '▶';
}

function updateBpmDisplay() {
  const el = document.getElementById('warmupBpmDisplay');
  if (el) el.textContent = bpm + ' BPM';
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initWarmup() {
  // Populate note selectors
  const lowestSel  = document.getElementById('warmupLowest');
  const highestSel = document.getElementById('warmupHighest');

  for (let m = WARMUP_LOW; m <= WARMUP_HIGH; m++) {
    const lbl = midiLabel(m);
    lowestSel.appendChild(new Option(lbl, m));
    highestSel.appendChild(new Option(lbl, m));
  }
  lowestSel.value  = lowestMidi;
  highestSel.value = highestMidi;

  lowestSel.addEventListener('change', () => {
    lowestMidi = +lowestSel.value;
    if (lowestMidi >= highestMidi) {
      highestMidi = lowestMidi + 1;
      highestSel.value = highestMidi;
    }
  });
  highestSel.addEventListener('change', () => {
    highestMidi = +highestSel.value;
    if (highestMidi <= lowestMidi) {
      lowestMidi = highestMidi - 1;
      lowestSel.value = lowestMidi;
    }
  });

  // Pattern selector
  const patternSel = document.getElementById('warmupPattern');
  patternSel.value = patternKey;
  patternSel.addEventListener('change', () => { patternKey = patternSel.value; });

  // BPM controls
  updateBpmDisplay();
  document.getElementById('warmupBpmDown').addEventListener('click', () => {
    bpm = Math.max(BPM_MIN, bpm - BPM_STEP);
    updateBpmDisplay();
  });
  document.getElementById('warmupBpmUp').addEventListener('click', () => {
    bpm = Math.min(BPM_MAX, bpm + BPM_STEP);
    updateBpmDisplay();
  });

  // Transport
  document.getElementById('warmupPlayPause').addEventListener('click', () => {
    if (isPlaying) pause(); else play();
  });
  document.getElementById('warmupRestart').addEventListener('click', restart);
}

// ── Test helpers ──────────────────────────────────────────────────────────────
export function getWarmupState() {
  return { lowestMidi, highestMidi, patternKey, bpm, isPlaying, isPaused, keyIndex, phase, patternStep, keySequence: keySequence.slice(), heldNotes: heldNotes.slice() };
}

export function setWarmupState(overrides) {
  if (overrides.lowestMidi  !== undefined) lowestMidi  = overrides.lowestMidi;
  if (overrides.highestMidi !== undefined) highestMidi = overrides.highestMidi;
  if (overrides.patternKey  !== undefined) patternKey  = overrides.patternKey;
  if (overrides.bpm         !== undefined) bpm         = overrides.bpm;
  if (overrides.isPlaying   !== undefined) isPlaying   = overrides.isPlaying;
  if (overrides.isPaused    !== undefined) isPaused    = overrides.isPaused;
  if (overrides.keyIndex    !== undefined) keyIndex    = overrides.keyIndex;
  if (overrides.phase       !== undefined) phase       = overrides.phase;
  if (overrides.patternStep !== undefined) patternStep = overrides.patternStep;
  if (overrides.keySequence !== undefined) keySequence = overrides.keySequence;
}

export function resetWarmup() {
  clearTimeout(timerId);
  timerId     = null;
  lowestMidi  = 48;
  highestMidi = 60;
  patternKey  = 'arpeggio';
  bpm         = 80;
  isPlaying   = false;
  isPaused    = false;
  keySequence = [];
  keyIndex    = 0;
  phase       = 'chord1';
  patternStep = 0;
  heldNotes   = [];
}
