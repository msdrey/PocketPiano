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

/**
 * Override getBoundingClientRect for the element with the given data-midi value.
 * In jsdom every element defaults to {0,0,0,0}, so only explicitly mocked keys
 * will be "hit" by keyAt for non-zero coordinates.
 */
function mockRect(midi, left, right, top, bottom) {
  const el = document.querySelector(`[data-midi="${midi}"]`);
  el.getBoundingClientRect = () => ({ left, right, top, bottom });
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
  it('identifies a white key from coordinates inside its bounding rect', () => {
    mockRect(60, 10, 57, 0, 120); // C4
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 33, clientY: 60, bubbles: true }));
    expect(playNote).toHaveBeenCalledWith(60);
  });

  it('prefers a black key over a white key when their rects overlap (black keys checked first)', () => {
    mockRect(61, 40, 70, 0, 80);  // C#4 black key overlaps C4 x-range
    mockRect(60, 10, 57, 0, 120); // C4 white key
    // x=55 falls in both rects; keyAt checks black keys first, so C#4 wins
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 55, clientY: 40, bubbles: true }));
    expect(playNote).toHaveBeenCalledWith(61);
  });

  it('returns null (plays nothing) when coordinates land outside every key', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 9999, clientY: 9999, bubbles: true }));
    expect(playNote).not.toHaveBeenCalled();
  });
});

// ── Touch events ───────────────────────────────────────────────────────────────
describe('touch events', () => {
  it('touchstart on a key calls primeAudio and plays the note', () => {
    mockRect(60, 10, 57, 0, 120);
    fireTouchEvent('touchstart', [makeTouch(1, 33, 60)]);
    expect(primeAudio).toHaveBeenCalled();
    expect(playNote).toHaveBeenCalledWith(60);
  });

  it('touchstart off all keys calls primeAudio but plays nothing', () => {
    fireTouchEvent('touchstart', [makeTouch(1, 9999, 9999)]);
    expect(primeAudio).toHaveBeenCalled();
    expect(playNote).not.toHaveBeenCalled();
  });

  it('touchstart adds the transpose offset when playing', () => {
    getTranspose.mockReturnValueOnce(3);
    mockRect(60, 10, 57, 0, 120);
    fireTouchEvent('touchstart', [makeTouch(1, 33, 60)]);
    expect(playNote).toHaveBeenCalledWith(63); // 60 + 3
  });

  it('touchmove to a different key releases the old note and presses the new one', () => {
    mockRect(60, 10, 57, 0, 120);  // C4
    fireTouchEvent('touchstart', [makeTouch(1, 33, 60)]);

    mockRect(62, 57, 104, 0, 120); // D4
    fireTouchEvent('touchmove', [makeTouch(1, 80, 60)]);

    expect(stopNote).toHaveBeenCalledWith(60);
    expect(playNote).toHaveBeenCalledWith(62);
  });

  it('touchmove off all keys releases the held note and presses nothing', () => {
    mockRect(60, 10, 57, 0, 120);
    fireTouchEvent('touchstart', [makeTouch(1, 33, 60)]);
    fireTouchEvent('touchmove', [makeTouch(1, 9999, 9999)]);

    expect(stopNote).toHaveBeenCalledWith(60);
    expect(playNote).toHaveBeenCalledTimes(1); // only the initial press
  });

  it('touchmove within the same key does nothing', () => {
    mockRect(60, 10, 57, 0, 120);
    fireTouchEvent('touchstart', [makeTouch(1, 33, 60)]);
    fireTouchEvent('touchmove', [makeTouch(1, 40, 60)]); // still inside C4

    expect(stopNote).not.toHaveBeenCalled();
    expect(playNote).toHaveBeenCalledTimes(1);
  });

  it('touchend releases the pressed key', () => {
    mockRect(60, 10, 57, 0, 120);
    fireTouchEvent('touchstart', [makeTouch(1, 33, 60)]);
    fireTouchEvent('touchend', [makeTouch(1, 33, 60)]);

    expect(stopNote).toHaveBeenCalledWith(60);
  });

  it('touchcancel releases the pressed key', () => {
    mockRect(60, 10, 57, 0, 120);
    fireTouchEvent('touchstart', [makeTouch(1, 33, 60)]);
    fireTouchEvent('touchcancel', [makeTouch(1, 33, 60)]);

    expect(stopNote).toHaveBeenCalledWith(60);
  });

  it('two simultaneous touches each play their respective note', () => {
    mockRect(60, 10, 57, 0, 120);   // C4
    mockRect(64, 104, 151, 0, 120); // E4
    fireTouchEvent('touchstart', [makeTouch(1, 33, 60), makeTouch(2, 127, 60)]);

    expect(playNote).toHaveBeenCalledWith(60);
    expect(playNote).toHaveBeenCalledWith(64);
  });

  it('touchend for one identifier does not release other active touches', () => {
    mockRect(60, 10, 57, 0, 120);
    mockRect(64, 104, 151, 0, 120);
    fireTouchEvent('touchstart', [makeTouch(1, 33, 60)]);
    fireTouchEvent('touchstart', [makeTouch(2, 127, 60)]);

    fireTouchEvent('touchend', [makeTouch(1, 33, 60)]);

    expect(stopNote).toHaveBeenCalledWith(60);
    expect(stopNote).not.toHaveBeenCalledWith(64);
  });

  it('second touchstart on an already-pressed key is idempotent (press() guards via pressed Map)', () => {
    mockRect(60, 10, 57, 0, 120);
    fireTouchEvent('touchstart', [makeTouch(1, 33, 60)]);
    fireTouchEvent('touchstart', [makeTouch(1, 33, 60)]); // same identifier, same key

    expect(playNote).toHaveBeenCalledTimes(1);
  });
});

// ── Mouse events ───────────────────────────────────────────────────────────────
describe('mouse events', () => {
  it('mousedown on a key calls primeAudio and plays the note', () => {
    mockRect(60, 10, 57, 0, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 33, clientY: 60, bubbles: true }));
    expect(primeAudio).toHaveBeenCalled();
    expect(playNote).toHaveBeenCalledWith(60);
  });

  it('mousedown off all keys calls primeAudio but plays nothing', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 9999, clientY: 9999, bubbles: true }));
    expect(primeAudio).toHaveBeenCalled();
    expect(playNote).not.toHaveBeenCalled();
  });

  it('mousedown adds the transpose offset when playing', () => {
    getTranspose.mockReturnValueOnce(5);
    mockRect(60, 10, 57, 0, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 33, clientY: 60, bubbles: true }));
    expect(playNote).toHaveBeenCalledWith(65); // 60 + 5
  });

  it('mousemove without a prior mousedown plays nothing', () => {
    mockRect(60, 10, 57, 0, 120);
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 33, clientY: 60, bubbles: true }));
    expect(playNote).not.toHaveBeenCalled();
  });

  it('mousemove after mousedown glides to the new key', () => {
    mockRect(60, 10, 57, 0, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 33, clientY: 60, bubbles: true }));

    mockRect(62, 57, 104, 0, 120);
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 80, clientY: 60, bubbles: true }));

    expect(stopNote).toHaveBeenCalledWith(60);
    expect(playNote).toHaveBeenCalledWith(62);
  });

  it('mousemove within the same key does not retrigger', () => {
    mockRect(60, 10, 57, 0, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 33, clientY: 60, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 60, bubbles: true }));

    expect(stopNote).not.toHaveBeenCalled();
    expect(playNote).toHaveBeenCalledTimes(1);
  });

  it('mousemove off all keys releases the held note', () => {
    mockRect(60, 10, 57, 0, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 33, clientY: 60, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 9999, clientY: 9999, bubbles: true }));

    expect(stopNote).toHaveBeenCalledWith(60);
    expect(playNote).toHaveBeenCalledTimes(1);
  });

  it('mouseup releases the held key', () => {
    mockRect(60, 10, 57, 0, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 33, clientY: 60, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(stopNote).toHaveBeenCalledWith(60);
  });

  it('mouseup when no key is held does not call stopNote', () => {
    document.dispatchEvent(new MouseEvent('mousedown', { clientX: 9999, clientY: 9999, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(stopNote).not.toHaveBeenCalled();
  });
});
