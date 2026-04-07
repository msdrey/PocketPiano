import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Module mocks (declared before imports) ─────────────────────────────────────
vi.mock('./audio.js', () => ({
  playNote: vi.fn(),
  stopNote: vi.fn(),
}));

vi.mock('./transpose.js', () => ({
  getTranspose: vi.fn(() => 0),
}));

import { playNote, stopNote } from './audio.js';
import { getTranspose } from './transpose.js';
import {
  isQuarterToneEnabled,
  buildQuarterToneLayer,
  enableQuarterTone,
  disableQuarterTone,
  pressQt,
  releaseQt,
} from './quartertone.js';

// ── DOM setup ──────────────────────────────────────────────────────────────────
function setupDOM() {
  document.body.innerHTML = `
    <button id="qtToggle"></button>
    <div id="keyboard">
      <div id="quarterToneLayer"></div>
    </div>
  `;
}

beforeEach(() => {
  setupDOM();
  vi.clearAllMocks();
  // Ensure disabled state before each test
  if (isQuarterToneEnabled()) disableQuarterTone();
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ── isQuarterToneEnabled ───────────────────────────────────────────────────────
describe('isQuarterToneEnabled', () => {
  it('is false by default', () => {
    expect(isQuarterToneEnabled()).toBe(false);
  });

  it('returns true after enableQuarterTone()', () => {
    enableQuarterTone();
    expect(isQuarterToneEnabled()).toBe(true);
  });

  it('returns false after disableQuarterTone()', () => {
    enableQuarterTone();
    disableQuarterTone();
    expect(isQuarterToneEnabled()).toBe(false);
  });
});

// ── buildQuarterToneLayer ──────────────────────────────────────────────────────
describe('buildQuarterToneLayer', () => {
  beforeEach(() => {
    buildQuarterToneLayer();
  });

  it('creates 48 quarter-tone keys (one between each of the 48 adjacent semitone pairs)', () => {
    // MIDI 36–84 = 49 notes → 48 adjacent pairs → 48 quarter-tone keys
    const keys = document.querySelectorAll('.key-qt');
    expect(keys.length).toBe(48);
  });

  it('first key has data-midi 36.5', () => {
    const keys = document.querySelectorAll('.key-qt');
    expect(+keys[0].dataset.midi).toBe(36.5);
  });

  it('last key has data-midi 83.5', () => {
    const keys = document.querySelectorAll('.key-qt');
    expect(+keys[keys.length - 1].dataset.midi).toBe(83.5);
  });

  it('all keys have fractional midi values (x.5)', () => {
    const keys = document.querySelectorAll('.key-qt');
    for (const k of keys) {
      expect(+k.dataset.midi % 1).toBe(0.5);
    }
  });

  it('keys between two naturals get ‡ label (e.g. C4–C#4 → ‡)', () => {
    // MIDI 60 (C4) is natural → its quarter-tone key (60.5) should be ‡
    const key = document.querySelector('[data-midi="60.5"]');
    expect(key).not.toBeNull();
    expect(key.querySelector('.key-qt-label').textContent).toBe('‡');
  });

  it('keys between two sharps/naturals get ♯ label (e.g. C#4–D4 → ♯)', () => {
    // MIDI 61 (C#4) is black → its quarter-tone key (61.5) should be ♯
    const key = document.querySelector('[data-midi="61.5"]');
    expect(key).not.toBeNull();
    expect(key.querySelector('.key-qt-label').textContent).toBe('♯');
  });

  it('each key has a left style set (positioned)', () => {
    const keys = document.querySelectorAll('.key-qt');
    for (const k of keys) {
      expect(k.style.left).not.toBe('');
    }
  });

  it('rebuilding replaces existing keys (no duplicates)', () => {
    buildQuarterToneLayer(); // build twice
    expect(document.querySelectorAll('.key-qt').length).toBe(48);
  });
});

// ── enableQuarterTone / disableQuarterTone ─────────────────────────────────────
describe('enableQuarterTone', () => {
  it('shows the quarter-tone layer', () => {
    enableQuarterTone();
    expect(document.getElementById('quarterToneLayer').style.display).toBe('block');
  });

  it('adds .active class to the toggle button', () => {
    enableQuarterTone();
    expect(document.getElementById('qtToggle').classList.contains('active')).toBe(true);
  });

  it('sets isQuarterToneEnabled to true', () => {
    enableQuarterTone();
    expect(isQuarterToneEnabled()).toBe(true);
  });
});

describe('disableQuarterTone', () => {
  beforeEach(() => { enableQuarterTone(); });

  it('hides the quarter-tone layer', () => {
    disableQuarterTone();
    expect(document.getElementById('quarterToneLayer').style.display).toBe('none');
  });

  it('removes .active class from the toggle button', () => {
    disableQuarterTone();
    expect(document.getElementById('qtToggle').classList.contains('active')).toBe(false);
  });

  it('sets isQuarterToneEnabled to false', () => {
    disableQuarterTone();
    expect(isQuarterToneEnabled()).toBe(false);
  });

  it('stops any held quarter-tone notes on disable', () => {
    enableQuarterTone();
    // Simulate a held note
    const key = document.querySelector('.key-qt');
    key.getBoundingClientRect = () => ({ left: 0, right: 20, top: 0, bottom: 30 });
    pressQt(60.5);
    expect(playNote).toHaveBeenCalledWith(60.5);

    disableQuarterTone();
    expect(stopNote).toHaveBeenCalledWith(60.5);
  });
});

// ── pressQt / releaseQt ────────────────────────────────────────────────────────
describe('pressQt', () => {
  beforeEach(() => {
    enableQuarterTone();
    // Add a fake qt key element to the DOM for classList checks
    const layer = document.getElementById('quarterToneLayer');
    const el = document.createElement('div');
    el.className = 'key-qt';
    el.dataset.midi = '60.5';
    layer.appendChild(el);
  });

  it('calls playNote with the fractional midi value', () => {
    pressQt(60.5);
    expect(playNote).toHaveBeenCalledWith(60.5);
  });

  it('applies transpose offset when pressing', () => {
    getTranspose.mockReturnValue(2);
    pressQt(60.5);
    expect(playNote).toHaveBeenCalledWith(62.5);
  });

  it('adds .pressed class to the key element', () => {
    pressQt(60.5);
    const el = document.querySelector('[data-midi="60.5"]');
    expect(el.classList.contains('pressed')).toBe(true);
  });

  it('does not trigger playNote again if already pressed', () => {
    pressQt(60.5);
    pressQt(60.5);
    expect(playNote).toHaveBeenCalledTimes(1);
  });
});

describe('releaseQt', () => {
  beforeEach(() => {
    getTranspose.mockReturnValue(0); // ensure no leftover transpose from previous tests
    enableQuarterTone();
    const layer = document.getElementById('quarterToneLayer');
    const el = document.createElement('div');
    el.className = 'key-qt';
    el.dataset.midi = '60.5';
    layer.appendChild(el);
    pressQt(60.5);
    vi.clearAllMocks();
  });

  it('calls stopNote with the originally-played midi', () => {
    releaseQt(60.5);
    expect(stopNote).toHaveBeenCalledWith(60.5);
  });

  it('removes .pressed class from the key element', () => {
    releaseQt(60.5);
    const el = document.querySelector('[data-midi="60.5"]');
    expect(el.classList.contains('pressed')).toBe(false);
  });

  it('does nothing if not currently pressed', () => {
    releaseQt(62.5); // never pressed
    expect(stopNote).not.toHaveBeenCalled();
  });
});

// ── Quarter-tone key positioning ───────────────────────────────────────────────
describe('quarter-tone key center positions', () => {
  const WHITE_W = 47;

  beforeEach(() => { buildQuarterToneLayer(); });

  // C4 (MIDI 60) white key center: 12 + 14*47 + 23.5 = 693.5
  // C#4 (MIDI 61) black key center: 12 + 14*47 + 47 + 1 = 718
  // Quarter-tone 60.5 should sit midway: (693.5 + 718) / 2 = 705.75
  it('C4-quarter-sharp (60.5) is centered between C4 and C#4', () => {
    const el = document.querySelector('[data-midi="60.5"]');
    const left = parseFloat(el.style.left);
    expect(left).toBeCloseTo(705.75, 1);
  });

  // C#4 (61) center = 718, D4 (62) white index 15 center: 12 + 15*47 + 23.5 = 740.5
  // Quarter-tone 61.5 midway: (718 + 740.5) / 2 = 729.25
  it('C#4-quarter-sharp (61.5) is centered between C#4 and D4', () => {
    const el = document.querySelector('[data-midi="61.5"]');
    const left = parseFloat(el.style.left);
    expect(left).toBeCloseTo(729.25, 1);
  });
});

// ── CSS: toggle hidden in portrait, shown in landscape ─────────────────────────
describe('CSS: quarter-tone toggle visibility', () => {
  let css;
  beforeEach(() => {
    css = readFileSync(resolve(__dirname, '../style.css'), 'utf8');
  });

  it('.qt-toggle-btn is display:none by default', () => {
    expect(css).toMatch(/\.qt-toggle-btn\s*\{[^}]*display:\s*none/);
  });

  it('.qt-toggle-btn is shown (display:flex) in landscape media query', () => {
    expect(css).toMatch(
      /@media\s*\(orientation:\s*landscape\)[^{]*\{[^}]*\.qt-toggle-btn[^}]*display:\s*flex/s
    );
  });
});
