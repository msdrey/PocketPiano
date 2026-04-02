// ── Audio context ──────────────────────────────────────────────────────────────
let ctx = null;
let primed = false;       // true after primeAudio() has run on this context
let contextReady = false; // true after first note is scheduled on this context
let masterGain = null;    // single GainNode wired to destination; created lazily on first note
let volume = 1.0;         // desired volume, applied to masterGain when it exists

// When the AudioContext is suspended (strict autoplay policy), resume() is async.
// We track the ongoing resume promise so we can schedule exactly ONE note to play
// once the context unlocks — preventing the burst caused by queuing many notes.
let resumePromise = null;
let pendingMidi   = null; // first note pressed during the suspension window

export function getVolume() { return volume; }

export function setVolume(v) {
  volume = v;
  if (masterGain) masterGain.gain.value = v;
}

// Lazily create the AudioContext on first use (must be inside a user gesture so
// Chrome starts it in 'running' state rather than 'suspended')
function getContext() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

// Call this at the start of every touch/mouse handler to create the AudioContext
// and play a silent buffer — this wakes the audio hardware so it is ready by
// the time the first note is scheduled.
//
// Always called from a direct user-gesture handler, so c.resume() is reliable
// here.  playNote() does NOT call resume() — it only parks pendingMidi — because
// setTimeout callbacks are not user gestures and resume() is unreliable there.
export function primeAudio() {
  const c = getContext();
  if (!c) return;
  // Always try to resume from this user-gesture context, even if already primed.
  // A resumePromise guard prevents flooding when a resume is already in flight.
  if (c.state === 'suspended' && !resumePromise) {
    resumePromise = c.resume().then(() => {
      resumePromise = null;
      if (pendingMidi !== null) {
        const midi = pendingMidi;
        pendingMidi = null;
        scheduleNote(midi);
      }
    });
  }
  if (primed) return;
  primed = true;
  const buf = c.createBuffer(1, 1, c.sampleRate);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start(0);
}

// When the page is restored from BFCache (tab closed/reopened), the module's
// ctx variable still points to the old AudioContext which is now dead.
// Reset it so the next keypress creates a fresh one.
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && ctx) { ctx.close(); ctx = null; masterGain = null; primed = false; contextReady = false; resumePromise = null; pendingMidi = null; }
  });
}

// ── Synthesis (additive sine harmonics) ───────────────────────────────────────
const activeNodes = {};
const fadingNodes = {}; // nodes in release fade, still need killing on retrigger

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// setContext resets all per-context state so tests start from a clean slate
export function setContext(audioCtx) {
  ctx = audioCtx; masterGain = null; primed = false; contextReady = false;
  resumePromise = null; pendingMidi = null;
  for (const k of Object.keys(activeNodes)) delete activeNodes[k];
  for (const k of Object.keys(fadingNodes)) delete fadingNodes[k];
}

// Harmonic series: [multiplier, relative amplitude]
// Brighter grand piano tone: boosted 3rd–8th harmonics for presence and sparkle
const HARMONICS = [
  [1, 1.00],
  [2, 0.40],
  [3, 0.20],
  [4, 0.16],
  [5, 0.11],
  [6, 0.07],
  [7, 0.05],
  [8, 0.03],
];

function killNodes(midi) {
  for (const map of [activeNodes, fadingNodes]) {
    if (!map[midi]) continue;
    const { oscs, master } = map[midi];
    const t = ctx.currentTime;
    // Hold the current interpolated value before ramping down — prevents click on retrigger
    if (master.gain.cancelAndHoldAtTime) {
      master.gain.cancelAndHoldAtTime(t);
    } else {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
    }
    master.gain.linearRampToValueAtTime(0, t + 0.008);
    oscs.forEach(o => { try { o.stop(t + 0.012); } catch (e) {} });
    delete map[midi];
  }
}

function scheduleNote(midi) {
  killNodes(midi);

  // Lazily create the master gain node (once per context lifetime)
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(ctx.destination);
  }

  const freq = midiToFreq(midi);

  // First note after context creation: schedule 50ms ahead to let the audio
  // hardware finish initializing (avoids clicks/artifacts on first play).
  // primeAudio() has already started a silent buffer to kick-start the hardware.
  const startDelay = contextReady ? 0 : 0.05;
  contextReady = true;

  const now = ctx.currentTime + startDelay;

  // Decay time scales with pitch: low notes ring longer
  const decayTime = Math.max(0.8, 3.5 - (midi - 36) / 48 * 2.5);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.28, now + 0.006);
  master.gain.exponentialRampToValueAtTime(0.14, now + 0.1);
  master.gain.exponentialRampToValueAtTime(0.001, now + decayTime);

  const oscs = HARMONICS.map(([mult, amp]) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    const g = ctx.createGain();
    g.gain.value = amp;
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    return osc;
  });

  master.connect(masterGain);
  activeNodes[midi] = { oscs, master };
}

export function playNote(midi) {
  const c = getContext();
  if (!c) return;
  if (c.state === 'suspended') {
    // Context is suspended.  primeAudio() (called from the user-gesture handler)
    // is responsible for calling c.resume().  Here we just park the first note
    // so it plays the moment the context unlocks; subsequent notes are dropped.
    if (pendingMidi === null) pendingMidi = midi;
  } else {
    scheduleNote(midi);
  }
}

export function stopNote(midi) {
  if (midi === pendingMidi) { pendingMidi = null; } // cancel queued note on release
  if (!activeNodes[midi]) return;
  const { oscs, master } = activeNodes[midi];
  // Check before deleting: if 4 or more notes are currently sounding (active or
  // fading), use a short release to prevent oscillator pile-up from fast slides.
  // A threshold of 4 lets normal human-speed playing always get the full 300ms
  // release, while only kicking in during rapid slides where pile-up causes clicks.
  const soundingCount = Object.keys(activeNodes).length + Object.keys(fadingNodes).length;
  const otherNotesPlaying = soundingCount >= 4;
  delete activeNodes[midi];
  const now = ctx.currentTime;
  if (master.gain.cancelAndHoldAtTime) {
    master.gain.cancelAndHoldAtTime(now);
  } else {
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
  }
  const releaseTime = otherNotesPlaying ? 0.03 : 0.3;
  master.gain.linearRampToValueAtTime(0, now + releaseTime);
  fadingNodes[midi] = { oscs, master };
  setTimeout(() => {
    oscs.forEach(o => { try { o.stop(); } catch (e) {} });
    delete fadingNodes[midi];
  }, (releaseTime + 0.1) * 1000);
}
