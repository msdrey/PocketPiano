import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initVolumeControl } from './volume.js';
import * as audio from './audio.js';

describe('initVolumeControl', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input type="range" id="volumeSlider" min="0" max="100" value="100" />
    `;
    vi.spyOn(audio, 'setVolume').mockImplementation(() => {});
    vi.spyOn(audio, 'getVolume').mockReturnValue(1.0);
  });

  it('initializes slider to current volume (100% → value "100")', () => {
    initVolumeControl();
    expect(document.getElementById('volumeSlider').value).toBe('100');
  });

  it('initializes slider to 75 when getVolume returns 0.75', () => {
    audio.getVolume.mockReturnValue(0.75);
    initVolumeControl();
    expect(document.getElementById('volumeSlider').value).toBe('75');
  });

  it('calls setVolume with 0.5 when slider is moved to 50', () => {
    initVolumeControl();
    const slider = document.getElementById('volumeSlider');
    slider.value = '50';
    slider.dispatchEvent(new Event('input'));
    expect(audio.setVolume).toHaveBeenCalledWith(0.5);
  });

  it('calls setVolume with 0 at minimum', () => {
    initVolumeControl();
    const slider = document.getElementById('volumeSlider');
    slider.value = '0';
    slider.dispatchEvent(new Event('input'));
    expect(audio.setVolume).toHaveBeenCalledWith(0);
  });

  it('calls setVolume with 1 at maximum', () => {
    initVolumeControl();
    const slider = document.getElementById('volumeSlider');
    slider.value = '100';
    slider.dispatchEvent(new Event('input'));
    expect(audio.setVolume).toHaveBeenCalledWith(1);
  });
});
