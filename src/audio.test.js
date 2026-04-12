import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  midiToFreq, setContext, playNote, stopNote, primeAudio, setVolume, getVolume,
  nearestSampledNote, setSampleBuffer, loadSamples, SAMPLE_MIDI_NOTES,
} from './audio.js';

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
    createBufferSource: vi.fn(() => ({
      buffer: null,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    decodeAudioData: vi.fn(() => Promise.resolve({})),
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

  it('starts resuming the context when suspended', () => {
    const suspendedCtx = makeMockCtx({ state: 'suspended' });
    setContext(suspendedCtx);
    primeAudio();
    expect(suspendedCtx.resume).toHaveBeenCalledOnce();
  });

  it('calls resume() each time primeAudio is invoked while suspended', async () => {
    const suspendedCtx = makeMockCtx({ state: 'suspended' });
    setContext(suspendedCtx);
    primeAudio(); // starts resume; also creates silent buffer (primed=false→true)
    primeAudio(); // primed flag skips buffer creation, but still calls resume
    expect(suspendedCtx.resume).toHaveBeenCalledTimes(2);
    // Silent buffer created only once
    expect(suspendedCtx.createBuffer).toHaveBeenCalledOnce();
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

  it('plays the queued note once unlocked via primeAudio', async () => {
    const suspendedCtx = makeMockCtx({ state: 'suspended' });
    setContext(suspendedCtx);
    primeAudio(); // user gesture → starts resume
    playNote(60); // parks pendingMidi
    expect(suspendedCtx.resume).toHaveBeenCalledOnce();
    // Oscillators not yet created — context is still resuming
    expect(suspendedCtx.createOscillator).not.toHaveBeenCalled();
    await suspendedCtx.resume.mock.results[0].value; // flush resume promise
    // First note should play once the context has unlocked
    expect(suspendedCtx.createOscillator).toHaveBeenCalledTimes(8);
    setContext(mockCtx);
  });

  it('drops subsequent notes while suspended — only the first is queued', async () => {
    const suspendedCtx = makeMockCtx({ state: 'suspended' });
    setContext(suspendedCtx);
    primeAudio(); // user gesture → starts resume
    playNote(60); // first — queued as pendingMidi
    playNote(62); // dropped (pendingMidi already set)
    playNote(64); // dropped
    await suspendedCtx.resume.mock.results[0].value;
    // Exactly 8 oscillators (one note, 8 harmonics) — not 24
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

  it('still plays a queued note even if stopNote is called before unlock', async () => {
    // Piano notes decay via ADSR so playing after release is natural behaviour.
    // Cancelling the note would cause silence on quick taps.
    const suspendedCtx = makeMockCtx({ state: 'suspended' });
    setContext(suspendedCtx);
    primeAudio();        // starts resume
    playNote(60);        // parks as pendingMidi
    stopNote(60);        // stopNote does NOT clear pendingMidi
    await suspendedCtx.resume.mock.results[0].value;
    // note still plays — 8 oscillators created
    expect(suspendedCtx.createOscillator).toHaveBeenCalledTimes(8);
    setContext(mockCtx);
  });

  it('uses full 300ms release for an isolated note with no other notes playing', () => {
    mockCtx.currentTime = 0;
    playNote(60);
    stopNote(60); // only note; fadingNodes empty → full release
    const master = mockCtx.createGain.mock.results[1].value;
    const releaseCall = master.gain.linearRampToValueAtTime.mock.calls.find(c => c[0] === 0);
    expect(releaseCall[1]).toBeCloseTo(0 + 0.3, 5);
  });

  it('uses full 300ms release when fewer than 4 notes are sounding', () => {
    mockCtx.currentTime = 0;
    playNote(60);
    playNote(61);
    playNote(62); // 3 active notes — below threshold
    stopNote(60); // soundingCount === 3 < 4 → full release
    const master60 = mockCtx.createGain.mock.results[1].value;
    const releaseCall = master60.gain.linearRampToValueAtTime.mock.calls.find(c => c[0] === 0);
    expect(releaseCall[1]).toBeCloseTo(0 + 0.3, 5);
  });

  it('uses short 30ms release when 4 or more notes are sounding (fast slide)', () => {
    mockCtx.currentTime = 0;
    playNote(60);
    playNote(61);
    playNote(62);
    playNote(63); // 4 active notes — at threshold
    stopNote(60); // soundingCount === 4 >= 4 → short release
    const master60 = mockCtx.createGain.mock.results[1].value;
    const releaseCall = master60.gain.linearRampToValueAtTime.mock.calls.find(c => c[0] === 0);
    expect(releaseCall[1]).toBeCloseTo(0 + 0.03, 5);
  });
});

// ── nearestSampledNote ─────────────────────────────────────────────────────────
describe('nearestSampledNote', () => {
  it('returns the note itself when it is a sampled note', () => {
    expect(nearestSampledNote(60)).toBe(60); // C4 is sampled
    expect(nearestSampledNote(36)).toBe(36); // C2 (lowest in range) is sampled
    expect(nearestSampledNote(84)).toBe(84); // C6 (highest in range) is sampled
  });

  it('returns the closest sampled note for in-between pitches', () => {
    expect(nearestSampledNote(61)).toBe(60); // C#4: 1 below C4, 2 below Ds4
    expect(nearestSampledNote(62)).toBe(63); // D4: 2 above C4, 1 below Ds4
    expect(nearestSampledNote(37)).toBe(36); // C#2: closer to C2
    expect(nearestSampledNote(38)).toBe(39); // D2: closer to Ds2
  });

  it('covers all notes in SAMPLE_MIDI_NOTES', () => {
    for (const note of SAMPLE_MIDI_NOTES) {
      expect(nearestSampledNote(note)).toBe(note);
    }
  });
});

// ── loadSamples ───────────────────────────────────────────────────────────────
describe('loadSamples', () => {
  let mockCtx;
  let mockFetch;

  beforeEach(() => {
    mockCtx = makeMockCtx();
    setContext(mockCtx);
    mockFetch = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches one file per sampled note (17 notes in C2–C6)', () => {
    loadSamples();
    expect(mockFetch).toHaveBeenCalledTimes(SAMPLE_MIDI_NOTES.length);
  });

  it('fetches from the Salamander CDN with .mp3 extension', () => {
    loadSamples();
    const urls = mockFetch.mock.calls.map(c => c[0]);
    expect(urls.every(u => u.includes('salamander') && u.endsWith('.mp3'))).toBe(true);
  });

  it('is idempotent — fetches only once even if called multiple times', () => {
    loadSamples();
    loadSamples();
    expect(mockFetch).toHaveBeenCalledTimes(SAMPLE_MIDI_NOTES.length);
  });

  it('decodes fetched buffers into the AudioContext when available', async () => {
    const fakeArrayBuf = new ArrayBuffer(8);
    mockFetch = vi.fn().mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(fakeArrayBuf) });
    vi.stubGlobal('fetch', mockFetch);

    loadSamples();
    await new Promise(r => setTimeout(r, 0)); // flush fetch + arrayBuffer + decodeAudioData microtasks

    expect(mockCtx.decodeAudioData).toHaveBeenCalled();
  });

  it('silently ignores fetch failures without throwing', async () => {
    loadSamples();
    await new Promise(r => setTimeout(r, 0));
    // No assertion: verifies no unhandled rejection propagates
  });
});

// ── playNote with samples ──────────────────────────────────────────────────────
describe('playNote with samples', () => {
  let mockCtx;

  beforeEach(() => {
    mockCtx = makeMockCtx();
    setContext(mockCtx);
    vi.clearAllMocks();
    mockCtx = makeMockCtx();
    setContext(mockCtx);
  });

  it('uses a BufferSource (not oscillators) when the nearest sample is loaded', () => {
    setSampleBuffer(60, {}); // inject decoded buffer for C4
    playNote(60);
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    expect(mockCtx.createBufferSource).toHaveBeenCalledOnce();
  });

  it('uses the nearest sample buffer for non-sampled pitches', () => {
    const mockBuffer = {};
    setSampleBuffer(60, mockBuffer); // C4 (midi 60) covers neighbours
    playNote(61);                    // C#4 → nearest sampled is C4
    const src = mockCtx.createBufferSource.mock.results[0].value;
    expect(src.buffer).toBe(mockBuffer);
  });

  it('sets playback rate to pitch-shift from the sampled note to the target', () => {
    setSampleBuffer(60, {});
    playNote(61); // C#4 is 1 semitone above C4
    const src = mockCtx.createBufferSource.mock.results[0].value;
    expect(src.playbackRate.value).toBeCloseTo(Math.pow(2, 1 / 12), 4);
  });

  it('sets playback rate of 1.0 when playing an exactly sampled note', () => {
    setSampleBuffer(60, {});
    playNote(60);
    const src = mockCtx.createBufferSource.mock.results[0].value;
    expect(src.playbackRate.value).toBeCloseTo(1.0, 6);
  });

  it('falls back to oscillators when no sample is loaded', () => {
    // No setSampleBuffer — sampleBuffers is empty
    playNote(60);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(8);
    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
  });

  it('applies the same ADSR gain envelope to sample notes as to synth notes', () => {
    setSampleBuffer(60, {});
    playNote(60);
    // results[0] = masterGain (dest), results[1] = note master
    const master = mockCtx.createGain.mock.results[1].value;
    expect(master.gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.28, expect.any(Number));
  });

  it('stops the buffer source when the same note is retriggered', () => {
    setSampleBuffer(60, {});
    playNote(60);
    const firstSrc = mockCtx.createBufferSource.mock.results[0].value;
    playNote(60); // retrigger — killNodes should stop the first source
    expect(firstSrc.stop).toHaveBeenCalled();
  });
});

// ── stopNote with sample nodes ─────────────────────────────────────────────────
describe('stopNote with sample nodes', () => {
  let mockCtx;

  beforeEach(() => {
    mockCtx = makeMockCtx();
    setContext(mockCtx);
    vi.clearAllMocks();
    mockCtx = makeMockCtx();
    setContext(mockCtx);
  });

  it('fades master gain to zero on release of a sample note', () => {
    setSampleBuffer(60, {});
    playNote(60);
    const master = mockCtx.createGain.mock.results[1].value;
    stopNote(60);
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
  });

  it('stops the buffer source after the release fade', async () => {
    vi.useFakeTimers();
    setSampleBuffer(60, {});
    playNote(60);
    const src = mockCtx.createBufferSource.mock.results[0].value;
    stopNote(60);
    vi.runAllTimers();
    expect(src.stop).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does nothing for a sample note that was never played', () => {
    expect(() => stopNote(99)).not.toThrow();
  });
});
