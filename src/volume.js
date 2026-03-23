import { setVolume, getVolume } from './audio.js';

export function initVolumeControl() {
  const slider = document.getElementById('volumeSlider');
  slider.value = Math.round(getVolume() * 100);
  slider.addEventListener('input', () => {
    setVolume(slider.value / 100);
  });
}
