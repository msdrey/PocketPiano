import { describe, it, expect, vi, beforeEach } from 'vitest';
import { midiToFreq, setContext, playNote, stopNote } from '../audio.js';

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

function makeMockCtx() {
  return {
    currentTime: 0,
    sampleRate: 44100,
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
    // 7 harmonics → 7 per-harmonic gains + 1 master = 8 createGain calls
    expect(mockCtx.createGain).toHaveBeenCalledTimes(8);
  });

  it('creates one oscillator per harmonic (7)', () => {
    playNote(60);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(7);
  });

  it('starts all oscillators', () => {
    playNote(60);
    const oscs = mockCtx.createOscillator.mock.results.map(r => r.value);
    oscs.forEach(osc => expect(osc.start).toHaveBeenCalledOnce());
  });

  it('sets master gain attack envelope', () => {
    playNote(60);
    const master = mockCtx.createGain.mock.results[0].value;
    expect(master.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.28, expect.any(Number));
  });

  it('retrigger cancels old gain before starting fresh', () => {
    playNote(60);
    const firstMaster = mockCtx.createGain.mock.results[0].value;
    playNote(60); // retrigger
    expect(firstMaster.gain.cancelScheduledValues).toHaveBeenCalled();
  });

  it('does nothing when ctx is null', () => {
    setContext(null);
    expect(() => playNote(60)).not.toThrow();
    setContext(mockCtx);
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
    const master = mockCtx.createGain.mock.results[0].value;
    stopNote(60);
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
  });

  it('calling stopNote twice does not throw', () => {
    playNote(60);
    stopNote(60);
    expect(() => stopNote(60)).not.toThrow();
  });
});
