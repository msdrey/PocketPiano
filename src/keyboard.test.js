import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { noteName, isBlack, buildKeyboard } from './keyboard.js';

// ── noteName ───────────────────────────────────────────────────────────────────
describe('noteName', () => {
  it('MIDI 60 = C4 (middle C)', () => {
    expect(noteName(60)).toBe('C4');
  });

  it('MIDI 69 = A4', () => {
    expect(noteName(69)).toBe('A4');
  });

  it('MIDI 36 = C2 (keyboard start)', () => {
    expect(noteName(36)).toBe('C2');
  });

  it('MIDI 84 = C6 (keyboard end)', () => {
    expect(noteName(84)).toBe('C6');
  });

  it('MIDI 61 = C#4', () => {
    expect(noteName(61)).toBe('C#4');
  });

  it('MIDI 57 = A3', () => {
    expect(noteName(57)).toBe('A3');
  });
});

// ── isBlack ────────────────────────────────────────────────────────────────────
describe('isBlack', () => {
  it('C (mod 0) is white', () => expect(isBlack(60)).toBe(false));
  it('C# (mod 1) is black', () => expect(isBlack(61)).toBe(true));
  it('D (mod 2) is white', () => expect(isBlack(62)).toBe(false));
  it('D# (mod 3) is black', () => expect(isBlack(63)).toBe(true));
  it('E (mod 4) is white', () => expect(isBlack(64)).toBe(false));
  it('F (mod 5) is white', () => expect(isBlack(65)).toBe(false));
  it('F# (mod 6) is black', () => expect(isBlack(66)).toBe(true));
  it('G (mod 7) is white', () => expect(isBlack(67)).toBe(false));
  it('G# (mod 8) is black', () => expect(isBlack(68)).toBe(true));
  it('A (mod 9) is white', () => expect(isBlack(69)).toBe(false));
  it('A# (mod 10) is black', () => expect(isBlack(70)).toBe(true));
  it('B (mod 11) is white', () => expect(isBlack(71)).toBe(false));
});

// ── buildKeyboard ──────────────────────────────────────────────────────────────
describe('buildKeyboard', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="keyboardScroll">
        <div id="keyboard">
          <div id="blackKeysLayer"></div>
        </div>
      </div>
      <input type="range" id="scrollSlider" min="0" max="1000" value="0" />
    `;
    vi.spyOn(HTMLElement.prototype, 'scrollLeft', 'set').mockImplementation(() => {});
    buildKeyboard();
  });

  it('creates 29 white keys for MIDI 36–84', () => {
    // 4 complete octaves (7 whites each) + final C6 = 29
    const whites = document.querySelectorAll('.key-white');
    expect(whites.length).toBe(29);
  });

  it('creates 20 black keys for MIDI 36–84', () => {
    // 4 complete octaves × 5 black keys = 20
    const blacks = document.querySelectorAll('.key-black');
    expect(blacks.length).toBe(20);
  });

  it('white keys have correct data-midi attributes', () => {
    expect(document.querySelector('[data-midi="60"]')).toBeTruthy();
    expect(document.querySelector('[data-midi="62"]')).toBeTruthy();
  });

  it('black keys have correct data-midi attributes', () => {
    expect(document.querySelector('[data-midi="61"]')).toBeTruthy();
    expect(document.querySelector('[data-midi="63"]')).toBeTruthy();
  });

  it('C notes have a label with the correct name', () => {
    const c4 = document.querySelector('[data-midi="60"]');
    expect(c4.querySelector('.label')?.textContent).toBe('C4');

    const c2 = document.querySelector('[data-midi="36"]');
    expect(c2.querySelector('.label')?.textContent).toBe('C2');
  });

  it('non-C white notes have no label', () => {
    const d4 = document.querySelector('[data-midi="62"]');
    expect(d4.querySelector('.label')).toBeNull();
  });

  it('sets keyboard width based on WHITE_W=47 and 29 white keys', () => {
    const keyboard = document.getElementById('keyboard');
    expect(keyboard.style.width).toBe('1387px'); // 29 * 47 + 24
  });
});

// ── Responsive CSS layout ───────────────────────────────────────────────────────
describe('responsive layout (style.css)', () => {
  let css;
  beforeEach(() => {
    css = readFileSync(resolve(__dirname, '../style.css'), 'utf8');
  });

  it('keyboard-scroll uses flex:1 (no fixed height)', () => {
    expect(css).toMatch(/\.keyboard-scroll\s*\{[^}]*flex:\s*1/);
    expect(css).not.toMatch(/\.keyboard-scroll\s*\{[^}]*height:\s*\d/);
  });

  it('rail has compact height of 60px', () => {
    expect(css).toMatch(/\.rail\s*\{[^}]*height:\s*60px/);
  });

  it('landscape media query shrinks header padding', () => {
    expect(css).toMatch(/@media\s*\(orientation:\s*landscape\)[^{]*\{[^}]*\.header[^}]*padding/s);
  });

  it('landscape media query shrinks rail height', () => {
    expect(css).toMatch(/@media\s*\(orientation:\s*landscape\)[^{]*\{[^}]*\.rail[^}]*height/s);
  });
});
