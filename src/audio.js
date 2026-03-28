// ── Audio context ──────────────────────────────────────────────────────────────
let ctx = null;
let primed = false;       // true after primeAudio() has run on this context
let contextReady = false; // true after first note is scheduled on this context
let masterGain = null;    // single GainNode wired to destination; created lazily on first note
let volume = 1.0;         // desired volume, applied to masterGain when it exists

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
export function primeAudio() {
  const c = getContext();
  if (!c || primed) return;
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
    if (e.persisted && ctx) { ctx.close(); ctx = null; masterGain = null; primed = false; contextReady = false; }
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
  for (const k of Object.keys(activeNodes)) delete activeNodes[k];
  for (const k of Object.keys(fadingNodes)) delete fadingNodes[k];
}

// Harmonic series: [multiplier, relative amplitude]
// Brighter grand piano tone: boosted 3rd–8th harmonics for presence and sparkle
const HARMONICS = [
  [1, 1.00],
  [2, 0.40],
  [3, 0.22],
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
    // Fallback: context was created outside a user gesture (e.g. tests); resume first
    c.resume().then(() => scheduleNote(midi));
  } else {
    scheduleNote(midi);
  }
}

export function stopNote(midi) {
  if (!activeNodes[midi]) return;
  const { oscs, master } = activeNodes[midi];
  // Check before deleting: if other notes are currently sounding (active or
  // still fading from a previous slide step), use a short release to prevent
  // oscillator pile-up. Isolated single notes always get the natural 300ms fade.
  const otherNotesPlaying =
    Object.keys(activeNodes).length > 1 || Object.keys(fadingNodes).length > 0;
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
