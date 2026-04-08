import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Module mocks must be declared before the imports they affect.
vi.mock('./audio.js', () => ({
  playNote: vi.fn(),
  stopNote: vi.fn(),
  primeAudio: vi.fn(),
}));

vi.mock('./transpose.js', () => ({
  getTranspose: vi.fn(() => 0),
  resetTranspose: vi.fn(),
  initTransposeControls: vi.fn(),
}));

import { playNote, stopNote, primeAudio } from './audio.js';
import { getTranspose } from './transpose.js';
import { buildKeyboard } from './keyboard.js';

// ── Touch polyfill ─────────────────────────────────────────────────────────────
// jsdom does not ship Touch / TouchEvent; provide lightweight stand-ins.
if (!global.Touch) {
  global.Touch = class Touch {
    constructor({ identifier, target, clientX = 0, clientY = 0 }) {
      Object.assign(this, { identifier, target, clientX, clientY });
    }
  };
}
if (!global.TouchEvent) {
  global.TouchEvent = class TouchEvent extends Event {
    constructor(type, init = {}) {
      super(type, { bubbles: true, cancelable: true, ...init });
      this.changedTouches = init.changedTouches ?? [];
    }
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function setupDOM() {
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
}

function makeTouch(identifier, clientX, clientY) {
  return new Touch({ identifier, target: document.body, clientX, clientY });
}

function fireTouchEvent(type, touches) {
  const evt = new TouchEvent(type, {
    changedTouches: touches,
    bubbles: true,
    cancelable: type === 'touchstart',
  });
  document.dispatchEvent(evt);
  return evt;
}

/**
 * Flush any in-flight interaction state held by keyboard.js module-level
 * variables (pressed Map, touchMap, mouseHeld / mouseMidi) so each test
 * starts clean.
 */
function resetInteractionState() {
  // Cancel up to 3 touch identifiers used across the test suite.
  fireTouchEvent('touchcancel', [
    makeTouch(1, 0, 0),
    makeTouch(2, 0, 0),
    makeTouch(3, 0, 0),
  ]);
  document.dispatchEvent(new MouseEvent('mouseup'));
}

// ── Key coordinate constants ───────────────────────────────────────────────────
// In jsdom getBoundingClientRect() always returns zeros, so kbLeft=0, kbTop=0,
// and kbScrollEl.scrollLeft=0.  That means xRel = clientX exactly, which lets
// us use real keyboard-geometry coordinates directly as clientX values.
//
// White key i spans [12 + i*47, 12 + (i+1)*47).
// Black key centre = 12 + li*47 + 47 + 1, width = 31 px → ±15 px from centre.
//   C4  (MIDI 60) white key index 14: x ∈ [670, 717], centre = 693
//   C#4 (MIDI 61) black key,    li=14: centre = 718,  x ∈ [703, 733]
//   D4  (MIDI 62) white key index 15: x ∈ [717, 764], centre = 740
//   E4  (MIDI 64) white key index 16: x ∈ [764, 811], centre = 787
const C4  = { x: 693, midi: 60 };
const Cs4 = { x: 710, midi: 61 }; // x=710 is clearly inside [703,733]
const D4  = { x: 740, midi: 62 };
const E4  = { x: 787, midi: 64 };
const Y   = 60; // arbitrary y inside the keyboard

// ── Shared lifecycle ───────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks(); // clear call counts; factory implementations (e.g. getTranspose → 0) persist
  setupDOM();
});

afterEach(() => {
  resetInteractionState();
  vi.restoreAllMocks(); // restore the scrollLeft setter spy
});

// ── keyAt — coordinate-to-key detection ───────────────────────────────────────
// keyAt is private; we verify its behaviour indirectly via mouse events, which
// call it internally and forward the resolved MIDI to press() → playNote().
describe('keyAt — coordinate-to-key detection', () => {
  it('identifies a white key from coordinates inside its column', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: C4.x, clientY: Y, bubbles: true }));
    expect(playNote).toHaveBeenCalledWith(C4.midi);
  });

  it('prefers a black key over the white key beneath it (black-key column wins)', () => {
    // x=710 falls inside C#4's column [703,733] which overlaps C4's column [670,717].
    // The column map checks black keys first, so C#4 (MIDI 61) wins.
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: Cs4.x, clientY: Y, bubbles: true }));
    expect(playNote).toHaveBeenCalledWith(Cs4.midi);
  });

  it('returns null (plays nothing) when coordinates land outside every key', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 9999, clientY: 9999, bubbles: true }));
    expect(playNote).not.toHaveBeenCalled();
  });
});

// ── Touch events ───────────────────────────────────────────────────────────────
describe('touch events', () => {
  it('touchstart on a key calls primeAudio and plays the note', () => {
    fireTouchEvent('touchstart', [makeTouch(1, C4.x, Y)]);
    expect(primeAudio).toHaveBeenCalled();
    expect(playNote).toHaveBeenCalledWith(C4.midi);
  });

  it('touchstart off all keys calls primeAudio but plays nothing', () => {
    fireTouchEvent('touchstart', [makeTouch(1, 9999, 9999)]);
    expect(primeAudio).toHaveBeenCalled();
    expect(playNote).not.toHaveBeenCalled();
  });

  it('touchstart adds the transpose offset when playing', () => {
    getTranspose.mockReturnValueOnce(3);
    fireTouchEvent('touchstart', [makeTouch(1, C4.x, Y)]);
    expect(playNote).toHaveBeenCalledWith(C4.midi + 3); // 63
  });

  it('touchmove to a different key releases the old note and presses the new one', () => {
    fireTouchEvent('touchstart', [makeTouch(1, C4.x, Y)]);
    fireTouchEvent('touchmove',  [makeTouch(1, D4.x, Y)]);

    expect(stopNote).toHaveBeenCalledWith(C4.midi);
    expect(playNote).toHaveBeenCalledWith(D4.midi);
  });

  it('touchmove off all keys releases the held note and presses nothing', () => {
    fireTouchEvent('touchstart', [makeTouch(1, C4.x, Y)]);
    fireTouchEvent('touchmove',  [makeTouch(1, 9999, 9999)]);

    expect(stopNote).toHaveBeenCalledWith(C4.midi);
    expect(playNote).toHaveBeenCalledTimes(1); // only the initial press
  });

  it('touchmove within the same key does nothing', () => {
    // x=700 is still inside C4's column [670,717] and not in any black key column
    fireTouchEvent('touchstart', [makeTouch(1, C4.x, Y)]);
    fireTouchEvent('touchmove',  [makeTouch(1, 700, Y)]);

    expect(stopNote).not.toHaveBeenCalled();
    expect(playNote).toHaveBeenCalledTimes(1);
  });

  it('touchend releases the pressed key', () => {
    fireTouchEvent('touchstart', [makeTouch(1, C4.x, Y)]);
    fireTouchEvent('touchend',   [makeTouch(1, C4.x, Y)]);

    expect(stopNote).toHaveBeenCalledWith(C4.midi);
  });

  it('touchcancel releases the pressed key', () => {
    fireTouchEvent('touchstart',  [makeTouch(1, C4.x, Y)]);
    fireTouchEvent('touchcancel', [makeTouch(1, C4.x, Y)]);

    expect(stopNote).toHaveBeenCalledWith(C4.midi);
  });

  it('two simultaneous touches each play their respective note', () => {
    fireTouchEvent('touchstart', [makeTouch(1, C4.x, Y), makeTouch(2, E4.x, Y)]);

    expect(playNote).toHaveBeenCalledWith(C4.midi);
    expect(playNote).toHaveBeenCalledWith(E4.midi);
  });

  it('touchend for one identifier does not release other active touches', () => {
    fireTouchEvent('touchstart', [makeTouch(1, C4.x, Y)]);
    fireTouchEvent('touchstart', [makeTouch(2, E4.x, Y)]);
    fireTouchEvent('touchend',   [makeTouch(1, C4.x, Y)]);

    expect(stopNote).toHaveBeenCalledWith(C4.midi);
    expect(stopNote).not.toHaveBeenCalledWith(E4.midi);
  });

  it('second touchstart on an already-pressed key is idempotent (press() guards via pressed Map)', () => {
    fireTouchEvent('touchstart', [makeTouch(1, C4.x, Y)]);
    fireTouchEvent('touchstart', [makeTouch(1, C4.x, Y)]); // same identifier, same key

    expect(playNote).toHaveBeenCalledTimes(1);
  });
});

// ── Mouse events (desktop) ─────────────────────────────────────────────────────
describe('mouse events', () => {
  it('mousedown on a key calls primeAudio and plays the note', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: C4.x, clientY: Y, bubbles: true }));
    expect(primeAudio).toHaveBeenCalled();
    expect(playNote).toHaveBeenCalledWith(C4.midi);
  });

  it('mousedown off all keys calls primeAudio but plays nothing', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 9999, clientY: 9999, bubbles: true }));
    expect(primeAudio).toHaveBeenCalled();
    expect(playNote).not.toHaveBeenCalled();
  });

  it('mousedown adds the transpose offset when playing', () => {
    getTranspose.mockReturnValueOnce(5);
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: C4.x, clientY: Y, bubbles: true }));
    expect(playNote).toHaveBeenCalledWith(C4.midi + 5); // 65
  });

  it('mousemove without a prior mousedown plays nothing', () => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: C4.x, clientY: Y, bubbles: true }));
    expect(playNote).not.toHaveBeenCalled();
  });

  it('mousemove after mousedown glides to the new key', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: C4.x, clientY: Y, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: D4.x, clientY: Y, bubbles: true }));

    expect(stopNote).toHaveBeenCalledWith(C4.midi);
    expect(playNote).toHaveBeenCalledWith(D4.midi);
  });

  it('mousemove within the same key does not retrigger', () => {
    // x=700 is still inside C4's column [670,717] and not in any black key column
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: C4.x, clientY: Y, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700,   clientY: Y, bubbles: true }));

    expect(stopNote).not.toHaveBeenCalled();
    expect(playNote).toHaveBeenCalledTimes(1);
  });

  it('mousemove off all keys releases the held note', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: C4.x, clientY: Y, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 9999, clientY: 9999, bubbles: true }));

    expect(stopNote).toHaveBeenCalledWith(C4.midi);
    expect(playNote).toHaveBeenCalledTimes(1);
  });

  it('mouseup releases the held key', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: C4.x, clientY: Y, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(stopNote).toHaveBeenCalledWith(C4.midi);
  });

  it('mouseup when no key is held does not call stopNote', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 9999, clientY: 9999, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(stopNote).not.toHaveBeenCalled();
  });
});
