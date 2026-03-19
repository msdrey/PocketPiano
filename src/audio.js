// ── Audio context ──────────────────────────────────────────────────────────────
let ctx = null;

export function initAudio() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx.resume().then(() => {
    // Unlock iOS Safari: play a silent buffer on the first user gesture
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  });
}

// ── Synthesis (additive sine harmonics) ───────────────────────────────────────
const activeNodes = {};
const fadingNodes = {}; // nodes in release fade, still need killing on retrigger

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function setContext(audioCtx) { ctx = audioCtx; }

// Harmonic series: [multiplier, relative amplitude]
// Mimics a mellow grand piano tone — strong fundamental, soft upper harmonics
const HARMONICS = [
  [1, 1.00],
  [2, 0.45],
  [3, 0.20],
  [4, 0.10],
  [5, 0.06],
  [6, 0.03],
  [7, 0.02],
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

export function playNote(midi) {
  if (!ctx) return;
  killNodes(midi);
  const freq = midiToFreq(midi);
  const now = ctx.currentTime;

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

  master.connect(ctx.destination);
  activeNodes[midi] = { oscs, master };
}

export function stopNote(midi) {
  if (!activeNodes[midi]) return;
  const { oscs, master } = activeNodes[midi];
  delete activeNodes[midi];
  const now = ctx.currentTime;
  if (master.gain.cancelAndHoldAtTime) {
    master.gain.cancelAndHoldAtTime(now);
  } else {
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
  }
  master.gain.linearRampToValueAtTime(0, now + 0.3);
  fadingNodes[midi] = { oscs, master };
  setTimeout(() => {
    oscs.forEach(o => { try { o.stop(); } catch (e) {} });
    delete fadingNodes[midi];
  }, 400);
}
