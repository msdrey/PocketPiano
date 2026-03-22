import { describe, it, expect, beforeEach } from 'vitest';
import { getTranspose, resetTranspose, initTransposeControls } from './transpose.js';

function setup() {
  document.body.innerHTML = `
    <button id="transposeDown"></button>
    <span id="transposeValue"></span>
    <button id="transposeUp"></button>
  `;
  resetTranspose();
  initTransposeControls();
}

// ── getTranspose ────────────────────────────────────────────────────────────────
describe('getTranspose', () => {
  beforeEach(() => { resetTranspose(); });

  it('returns 0 by default', () => {
    expect(getTranspose()).toBe(0);
  });
});

// ── initTransposeControls ───────────────────────────────────────────────────────
describe('initTransposeControls', () => {
  beforeEach(setup);

  it('displays "0" on init', () => {
    expect(document.getElementById('transposeValue').textContent).toBe('0');
  });

  it('+ button increments transpose', () => {
    document.getElementById('transposeUp').click();
    expect(getTranspose()).toBe(1);
  });

  it('- button decrements transpose', () => {
    document.getElementById('transposeDown').click();
    expect(getTranspose()).toBe(-1);
  });

  it('displays "+3" after three increments', () => {
    const btn = document.getElementById('transposeUp');
    btn.click(); btn.click(); btn.click();
    expect(document.getElementById('transposeValue').textContent).toBe('+3');
  });

  it('displays "-2" after two decrements', () => {
    const btn = document.getElementById('transposeDown');
    btn.click(); btn.click();
    expect(document.getElementById('transposeValue').textContent).toBe('-2');
  });

  it('+ button is disabled at +12', () => {
    const btn = document.getElementById('transposeUp');
    for (let i = 0; i < 12; i++) btn.click();
    expect(btn.disabled).toBe(true);
  });

  it('- button is disabled at -12', () => {
    const btn = document.getElementById('transposeDown');
    for (let i = 0; i < 12; i++) btn.click();
    expect(btn.disabled).toBe(true);
  });

  it('cannot go above +12', () => {
    const btn = document.getElementById('transposeUp');
    for (let i = 0; i < 20; i++) btn.click();
    expect(getTranspose()).toBe(12);
  });

  it('cannot go below -12', () => {
    const btn = document.getElementById('transposeDown');
    for (let i = 0; i < 20; i++) btn.click();
    expect(getTranspose()).toBe(-12);
  });

  it('- button is enabled when transpose > -12', () => {
    expect(document.getElementById('transposeDown').disabled).toBe(false);
  });

  it('+ button is enabled when transpose < +12', () => {
    expect(document.getElementById('transposeUp').disabled).toBe(false);
  });
});
