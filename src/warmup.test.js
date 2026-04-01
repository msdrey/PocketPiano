import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  buildKeySequence,
  maxPatternOffset,
  highestRoot,
  midiLabel,
  getPatterns,
  getWarmupState,
  setWarmupState,
  resetWarmup,
  initWarmup,
} from './warmup.js';

// ── Mock audio module ─────────────────────────────────────────────────────────
vi.mock('./audio.js', () => ({
  playNote:   vi.fn(),
  stopNote:   vi.fn(),
  primeAudio: vi.fn(),
}));

import { playNote, stopNote } from './audio.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildDOM() {
  document.body.innerHTML = `
    <section id="warmup-section">
      <select id="warmupLowest"></select>
      <select id="warmupHighest"></select>
      <select id="warmupPattern">
        <option value="arpeggio">Arpeggio</option>
        <option value="scale">Scale</option>
        <option value="triad">Triad</option>
      </select>
      <button id="warmupBpmDown">−</button>
      <span id="warmupBpmDisplay">80 BPM</span>
      <button id="warmupBpmUp">+</button>
      <button id="warmupRestart">↺</button>
      <button id="warmupPlayPause">▶</button>
    </section>
  `;
}

// ── buildKeySequence ──────────────────────────────────────────────────────────
describe('buildKeySequence', () => {
  it('produces ascending then descending arc', () => {
    expect(buildKeySequence(48, 51)).toEqual([48, 49, 50, 51, 50, 49, 48]);
  });

  it('single note (low === high) plays only once', () => {
    // arc: [48] up, [] down (high-1 < low, so nothing added going down)
    expect(buildKeySequence(48, 48)).toEqual([48]);
  });

  it('two-note range', () => {
    expect(buildKeySequence(48, 49)).toEqual([48, 49, 48]);
  });
});

// ── maxPatternOffset / highestRoot ───────────────────────────────────────────
describe('maxPatternOffset', () => {
  it('arpeggio reaches octave above root (12 semitones)', () => {
    expect(maxPatternOffset('arpeggio')).toBe(12);
  });

  it('scale reaches a fifth above root (7 semitones)', () => {
    expect(maxPatternOffset('scale')).toBe(7);
  });

  it('triad reaches a fifth above root (7 semitones)', () => {
    expect(maxPatternOffset('triad')).toBe(7);
  });
});

describe('highestRoot', () => {
  it('subtracts maxOffset from highestMidi for arpeggio', () => {
    // arpeggio offset=12; highest note=C4(60) → highest root=C3(48)
    expect(highestRoot('arpeggio', 60, 36)).toBe(48);
  });

  it('subtracts maxOffset from highestMidi for scale/triad', () => {
    // scale offset=7; highest note=G4(67) → highest root=C4(60)
    expect(highestRoot('scale', 67, 36)).toBe(60);
  });

  it('clamps to lowestMidi when highestMidi is too low for the pattern', () => {
    // arpeggio offset=12; highestMidi=40; lowestMidi=36 → 40-12=28 < 36 → 36
    expect(highestRoot('arpeggio', 40, 36)).toBe(36);
  });
});

// ── midiLabel ─────────────────────────────────────────────────────────────────
describe('midiLabel', () => {
  it('labels middle C correctly', () => expect(midiLabel(60)).toBe('C4'));
  it('labels C2 correctly',       () => expect(midiLabel(36)).toBe('C2'));
  it('labels C3 correctly',       () => expect(midiLabel(48)).toBe('C3'));
  it('labels C#4 correctly',      () => expect(midiLabel(61)).toBe('C#4'));
  it('labels A4 correctly',       () => expect(midiLabel(69)).toBe('A4'));
  it('labels C5 correctly',       () => expect(midiLabel(72)).toBe('C5'));
});

// ── Patterns ──────────────────────────────────────────────────────────────────
describe('getPatterns', () => {
  it('arpeggio hits root, M3, P5, octave and back', () => {
    expect(getPatterns().arpeggio).toEqual([0, 4, 7, 12, 7, 4, 0]);
  });

  it('scale is Do-Re-Mi arc', () => {
    expect(getPatterns().scale).toEqual([0, 2, 4, 5, 7, 5, 4, 2, 0]);
  });

  it('triad is 1-3-5-3-1', () => {
    expect(getPatterns().triad).toEqual([0, 4, 7, 4, 0]);
  });
});

// ── BPM controls ─────────────────────────────────────────────────────────────
describe('BPM controls', () => {
  beforeEach(() => { buildDOM(); resetWarmup(); initWarmup(); });
  afterEach(() => { resetWarmup(); });

  it('display initialises to 120 BPM', () => {
    expect(document.getElementById('warmupBpmDisplay').textContent).toBe('120 BPM');
  });

  it('+ button increments BPM by 4', () => {
    document.getElementById('warmupBpmUp').click();
    expect(document.getElementById('warmupBpmDisplay').textContent).toBe('124 BPM');
    expect(getWarmupState().bpm).toBe(124);
  });

  it('− button decrements BPM by 4', () => {
    document.getElementById('warmupBpmDown').click();
    expect(document.getElementById('warmupBpmDisplay').textContent).toBe('116 BPM');
    expect(getWarmupState().bpm).toBe(116);
  });

  it('BPM is clamped at maximum (160)', () => {
    for (let i = 0; i < 30; i++) document.getElementById('warmupBpmUp').click();
    expect(getWarmupState().bpm).toBe(160);
  });

  it('BPM is clamped at minimum (40)', () => {
    for (let i = 0; i < 30; i++) document.getElementById('warmupBpmDown').click();
    expect(getWarmupState().bpm).toBe(40);
  });
});

// ── Note selectors ────────────────────────────────────────────────────────────
describe('Note selectors', () => {
  beforeEach(() => { buildDOM(); resetWarmup(); initWarmup(); });
  afterEach(() => { resetWarmup(); });

  it('lowest selector contains C2 through C5', () => {
    const sel = document.getElementById('warmupLowest');
    const values = [...sel.options].map(o => +o.value);
    expect(values[0]).toBe(36);   // C2
    expect(values[values.length - 1]).toBe(72); // C5
  });

  it('defaults to C3 for lowest and C5 for highest', () => {
    expect(+document.getElementById('warmupLowest').value).toBe(48);
    expect(+document.getElementById('warmupHighest').value).toBe(72);
  });

  it('changing lowest updates state', () => {
    const sel = document.getElementById('warmupLowest');
    sel.value = '50';
    sel.dispatchEvent(new Event('change'));
    expect(getWarmupState().lowestMidi).toBe(50);
  });

  it('changing highest updates state', () => {
    const sel = document.getElementById('warmupHighest');
    sel.value = '62';
    sel.dispatchEvent(new Event('change'));
    expect(getWarmupState().highestMidi).toBe(62);
  });

  it('lowest is auto-raised if set above highest', () => {
    // Set highest to 50 first
    const hSel = document.getElementById('warmupHighest');
    hSel.value = '50';
    hSel.dispatchEvent(new Event('change'));
    // Now set lowest above highest
    const lSel = document.getElementById('warmupLowest');
    lSel.value = '55';
    lSel.dispatchEvent(new Event('change'));
    expect(getWarmupState().highestMidi).toBe(56);
  });

  it('highest is auto-lowered if set below lowest', () => {
    const lSel = document.getElementById('warmupLowest');
    lSel.value = '55';
    lSel.dispatchEvent(new Event('change'));
    const hSel = document.getElementById('warmupHighest');
    hSel.value = '50';
    hSel.dispatchEvent(new Event('change'));
    expect(getWarmupState().lowestMidi).toBe(49);
  });
});

// ── Sequencer: chord playback ─────────────────────────────────────────────────
describe('Sequencer – chord playback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    buildDOM();
    resetWarmup();
    playNote.mockClear();
    stopNote.mockClear();
    initWarmup();
    // Use a tiny range so sequence terminates quickly
    setWarmupState({ lowestMidi: 60, highestMidi: 61 });
  });
  afterEach(() => {
    resetWarmup();
    vi.useRealTimers();
  });

  it('first tick plays the opening major chord (root, M3, P5)', () => {
    document.getElementById('warmupPlayPause').click();
    vi.advanceTimersByTime(80); // pre-roll delay before first tick
    // root=60 → notes 60, 64, 67
    expect(playNote).toHaveBeenCalledWith(60);
    expect(playNote).toHaveBeenCalledWith(64);
    expect(playNote).toHaveBeenCalledWith(67);
    expect(getWarmupState().phase).toBe('pattern');
  });

  it('after 2 beats the pattern starts', () => {
    setWarmupState({ patternKey: 'triad' }); // offsets [0,4,7,4,0]
    document.getElementById('warmupPlayPause').click();
    playNote.mockClear();
    vi.advanceTimersByTime(80 + Math.ceil(60000 / 120 * 2)); // pre-roll + 2 beats
    // First pattern note should be root (offset 0)
    expect(playNote).toHaveBeenCalledWith(60);
  });

  it('isPlaying becomes true when play is pressed', () => {
    document.getElementById('warmupPlayPause').click();
    expect(getWarmupState().isPlaying).toBe(true);
  });
});

// ── Sequencer: pause & resume ─────────────────────────────────────────────────
describe('Sequencer – pause and resume', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    buildDOM();
    resetWarmup();
    playNote.mockClear();
    stopNote.mockClear();
    initWarmup();
    setWarmupState({ lowestMidi: 60, highestMidi: 62 });
  });
  afterEach(() => {
    resetWarmup();
    vi.useRealTimers();
  });

  it('pause stops isPlaying and sets isPaused', () => {
    document.getElementById('warmupPlayPause').click(); // play
    document.getElementById('warmupPlayPause').click(); // pause
    const s = getWarmupState();
    expect(s.isPlaying).toBe(false);
    expect(s.isPaused).toBe(true);
  });

  it('resume from pause continues from the same key', () => {
    document.getElementById('warmupPlayPause').click(); // play
    const keyIndexBeforePause = getWarmupState().keyIndex;
    document.getElementById('warmupPlayPause').click(); // pause
    document.getElementById('warmupPlayPause').click(); // resume
    expect(getWarmupState().keyIndex).toBe(keyIndexBeforePause);
    expect(getWarmupState().isPlaying).toBe(true);
  });

  it('play button shows ⏸ while playing and ▶ while paused', () => {
    const btn = document.getElementById('warmupPlayPause');
    btn.click(); // play
    expect(btn.textContent).toBe('⏸');
    btn.click(); // pause
    expect(btn.textContent).toBe('▶');
  });
});

// ── Sequencer: restart ────────────────────────────────────────────────────────
describe('Sequencer – restart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    buildDOM();
    resetWarmup();
    playNote.mockClear();
    stopNote.mockClear();
    initWarmup();
    setWarmupState({ lowestMidi: 60, highestMidi: 63 });
  });
  afterEach(() => {
    resetWarmup();
    vi.useRealTimers();
  });

  it('restart while playing resets keyIndex to 0 and keeps playing', () => {
    document.getElementById('warmupPlayPause').click(); // play
    // Advance past the opening chord so keyIndex might have moved
    vi.advanceTimersByTime(60000 / 120 * 10);
    document.getElementById('warmupRestart').click();
    const s = getWarmupState();
    expect(s.keyIndex).toBe(0);
    expect(s.isPlaying).toBe(true);
  });

  it('restart while idle stays idle', () => {
    document.getElementById('warmupRestart').click();
    const s = getWarmupState();
    expect(s.isPlaying).toBe(false);
    expect(s.isPaused).toBe(false);
  });

  it('restart while paused resets and starts playing', () => {
    document.getElementById('warmupPlayPause').click(); // play
    document.getElementById('warmupPlayPause').click(); // pause
    document.getElementById('warmupRestart').click();   // restart
    const s = getWarmupState();
    expect(s.keyIndex).toBe(0);
    expect(s.isPlaying).toBe(true);
  });
});

// ── Sequencer: key advancement ────────────────────────────────────────────────
describe('Sequencer – key advancement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    buildDOM();
    resetWarmup();
    playNote.mockClear();
    stopNote.mockClear();
    initWarmup();
  });
  afterEach(() => {
    resetWarmup();
    vi.useRealTimers();
  });

  it('advances to next key after chord2 phase', () => {
    // arpeggio offset=12; highestMidi=73 → highestRoot=61 → arc=[60,61,60]
    setWarmupState({ lowestMidi: 60, highestMidi: 73 });
    document.getElementById('warmupPlayPause').click();
    expect(getWarmupState().keySequence).toEqual([60, 61, 60]);
  });

  it('sequence stops when all keys are exhausted', () => {
    // A single-key sequence finishes after one block
    setWarmupState({ lowestMidi: 60, highestMidi: 60 });
    document.getElementById('warmupPlayPause').click(); // play
    // chord1=2, pattern=6×1+last×2=8, no final chord → 10 beats total
    // (plus 80ms pre-roll); 11 beats of headroom is sufficient
    const beatMs = 60000 / 120;
    vi.advanceTimersByTime(80 + beatMs * 11);
    expect(getWarmupState().isPlaying).toBe(false);
  });
});
