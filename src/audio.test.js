import { describe, it, expect, vi, beforeEach } from 'vitest';
import { midiToFreq, setContext, playNote, stopNote, primeAudio, setVolume, getVolume } from './audio.js';

// ── Web Audio API mock ─────────────────────────────────────────────────────────
function makeGainNode() {
  return {
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      cancelAndHoldAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeOscillator() {
  return {
    type: 'sine',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  };
}

function makeMockCtx({ state = 'running', currentTime = 0 } = {}) {
  return {
    currentTime,
    sampleRate: 44100,
    state,
    destination: {},
    createGain: vi.fn(makeGainNode),
    createOscillator: vi.fn(makeOscillator),
    createBuffer: vi.fn(() => ({ getChannelData: vi.fn(() => new Float32Array(1)) })),
    createBufferSource: vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() })),
    resume: vi.fn(() => Promise.resolve()),
  };
}

// ── midiToFreq ─────────────────────────────────────────────────────────────────
describe('midiToFreq', () => {
  it('A4 (MIDI 69) = 440 Hz', () => {
    expect(midiToFreq(69)).toBe(440);
  });

  it('A3 (MIDI 57) = 220 Hz', () => {
    expect(midiToFreq(57)).toBe(220);
  });

  it('A5 (MIDI 81) = 880 Hz', () => {
    expect(midiToFreq(81)).toBe(880);
  });

  it('Middle C (MIDI 60) ≈ 261.63 Hz', () => {
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });

  it('each octave doubles the frequency', () => {
    expect(midiToFreq(69)).toBe(midiToFreq(57) * 2);
  });
});

// ── primeAudio ────────────────────────────────────────────────────────────────
describe('primeAudio', () => {
  let mockCtx;

  beforeEach(() => {
    mockCtx = makeMockCtx();
    setContext(mockCtx);
  });

  it('plays a silent buffer to wake up the audio hardware', () => {
    primeAudio();
    expect(mockCtx.createBuffer).toHaveBeenCalledOnce();
    const src = mockCtx.createBufferSource.mock.results[0].value;
    expect(src.start).toHaveBeenCalledOnce();
  });

  it('is idempotent — does not re-prime if called again', () => {
    primeAudio();
    primeAudio();
    expect(mockCtx.createBuffer).toHaveBeenCalledOnce();
  });

  it('does nothing when ctx is unavailable', () => {
    setContext(null);
    expect(() => primeAudio()).not.toThrow();
  });
});

// ── playNote / stopNote ────────────────────────────────────────────────────────
describe('playNote', () => {
  let mockCtx;

  beforeEach(() => {
    mockCtx = makeMockCtx();
    setContext(mockCtx);
    vi.clearAllMocks();
    // Re-inject after clearAllMocks resets mock fn call counts (but not the ref)
    mockCtx = makeMockCtx();
    setContext(mockCtx);
  });

  it('creates one gain node per harmonic plus a master', () => {
    playNote(60);
    // masterGain (1, created lazily on first note) + 1 note master + 8 harmonic gains = 10
    expect(mockCtx.createGain).toHaveBeenCalledTimes(10);
  });

  it('creates one oscillator per harmonic (8)', () => {
    playNote(60);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(8);
  });

  it('starts all oscillators', () => {
    playNote(60);
    const oscs = mockCtx.createOscillator.mock.results.map(r => r.value);
    oscs.forEach(osc => expect(osc.start).toHaveBeenCalledOnce());
  });

  it('sets master gain attack envelope', () => {
    playNote(60);
    // results[0] = masterGain (destination node), results[1] = note master
    const master = mockCtx.createGain.mock.results[1].value;
    expect(master.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.28, expect.any(Number));
  });

  it('retrigger holds or cancels old gain before starting fresh', () => {
    playNote(60);
    // results[0] = masterGain, results[1] = note master for first playNote(60)
    const firstMaster = mockCtx.createGain.mock.results[1].value;
    playNote(60); // retrigger
    // killNodes uses cancelAndHoldAtTime when available (our click fix), falls back to cancelScheduledValues
    const stopped =
      firstMaster.gain.cancelAndHoldAtTime.mock.calls.length > 0 ||
      firstMaster.gain.cancelScheduledValues.mock.calls.length > 0;
    expect(stopped).toBe(true);
  });

  it('schedules first note 50ms ahead to let hardware initialize', () => {
    mockCtx.currentTime = 0;
    playNote(60);
    // results[0] = masterGain, results[1] = note master
    const master = mockCtx.createGain.mock.results[1].value;
    // setValueAtTime(0, now) where now = currentTime + 0.05
    expect(master.gain.setValueAtTime).toHaveBeenCalledWith(0, 0.05);
  });

  it('schedules subsequent notes at currentTime with no offset', () => {
    mockCtx.currentTime = 1;
    playNote(60); // first note: scheduled at 1 + 0.05 = 1.05
    playNote(61); // second note on same context: scheduled at ctx.currentTime = 1 (no offset)
    // results[0]=masterGain, results[1]=note master 60, results[2-9]=harmonics 60 (8 harmonics)
    // results[10]=note master 61 (masterGain already exists, not recreated)
    const secondMaster = mockCtx.createGain.mock.results[10].value;
    expect(secondMaster.gain.setValueAtTime).toHaveBeenCalledWith(0, 1);
  });

  it('resumes a suspended context and schedules note after resume resolves (mobile unlock)', async () => {
    const suspendedCtx = makeMockCtx({ state: 'suspended' });
    setContext(suspendedCtx);
    playNote(60);
    expect(suspendedCtx.resume).toHaveBeenCalledOnce();
    // Oscillators not yet created — scheduling happens after resume() resolves
    expect(suspendedCtx.createOscillator).not.toHaveBeenCalled();
    await suspendedCtx.resume.mock.results[0].value; // flush promise
    expect(suspendedCtx.createOscillator).toHaveBeenCalledTimes(8);
    setContext(mockCtx);
  });

  it('does not call resume when context is already running', () => {
    playNote(60);
    expect(mockCtx.resume).not.toHaveBeenCalled();
  });

  it('does nothing when AudioContext is unavailable', () => {
    setContext(null);
    // getContext() returns null when window.AudioContext is not defined (jsdom)
    expect(() => playNote(60)).not.toThrow();
    setContext(mockCtx);
  });
});

describe('setVolume / getVolume', () => {
  let mockCtx;

  beforeEach(() => {
    mockCtx = makeMockCtx();
    setContext(mockCtx);
    setVolume(1.0); // reset to default
  });

  it('getVolume returns 1.0 by default', () => {
    expect(getVolume()).toBe(1.0);
  });

  it('setVolume updates getVolume', () => {
    setVolume(0.5);
    expect(getVolume()).toBe(0.5);
  });

  it('setVolume applies immediately to existing masterGain', () => {
    playNote(60); // creates masterGain
    const masterGainNode = mockCtx.createGain.mock.results[0].value;
    setVolume(0.3);
    expect(masterGainNode.gain.value).toBe(0.3);
  });

  it('setVolume is applied to masterGain when first note is played', () => {
    setVolume(0.6);
    playNote(60);
    const masterGainNode = mockCtx.createGain.mock.results[0].value;
    expect(masterGainNode.gain.value).toBe(0.6);
  });
});

describe('stopNote', () => {
  let mockCtx;

  beforeEach(() => {
    mockCtx = makeMockCtx();
    setContext(mockCtx);
  });

  it('does nothing for a note that was never played', () => {
    expect(() => stopNote(99)).not.toThrow();
  });

  it('fades master gain to zero on release', () => {
    playNote(60);
    // results[0] = masterGain, results[1] = note master
    const master = mockCtx.createGain.mock.results[1].value;
    stopNote(60);
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
  });

  it('calling stopNote twice does not throw', () => {
    playNote(60);
    stopNote(60);
    expect(() => stopNote(60)).not.toThrow();
  });

  it('uses full 300ms release for an isolated note with no other notes playing', () => {
    mockCtx.currentTime = 0;
    playNote(60);
    stopNote(60); // only note; fadingNodes empty → full release
    const master = mockCtx.createGain.mock.results[1].value;
    const releaseCall = master.gain.linearRampToValueAtTime.mock.calls.find(c => c[0] === 0);
    expect(releaseCall[1]).toBeCloseTo(0 + 0.3, 5);
  });

  it('uses short 30ms release when another note is active (slide scenario)', () => {
    mockCtx.currentTime = 0;
    playNote(60);
    playNote(62); // second note still active
    stopNote(60); // activeNodes.length === 2 before delete → otherNotesPlaying = true
    // results[0]=masterGain, results[1]=note master 60
    const master60 = mockCtx.createGain.mock.results[1].value;
    const releaseCall = master60.gain.linearRampToValueAtTime.mock.calls.find(c => c[0] === 0);
    expect(releaseCall[1]).toBeCloseTo(0 + 0.03, 5);
  });

  it('uses short 30ms release when fading notes exist (slide already in progress)', () => {
    mockCtx.currentTime = 0;
    playNote(60);
    playNote(61);
    stopNote(60); // moves 60 to fadingNodes
    stopNote(61); // activeNodes now empty, but fadingNodes has 60 → short release
    // results[0]=masterGain, results[1]=note master 60, results[2-9]=8 harmonic gains for 60
    // results[10] = note master 61
    const master61 = mockCtx.createGain.mock.results[10].value;
    const releaseCall = master61.gain.linearRampToValueAtTime.mock.calls.find(c => c[0] === 0);
    expect(releaseCall[1]).toBeCloseTo(0 + 0.03, 5);
  });
});
