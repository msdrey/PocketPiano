let transpose = 0;
const MIN = -12, MAX = 12;

export function getTranspose() { return transpose; }

// For tests only — resets module state between test runs
export function resetTranspose() { transpose = 0; }

export function initTransposeControls() {
  const minusBtn = document.getElementById('transposeDown');
  const plusBtn  = document.getElementById('transposeUp');
  const display  = document.getElementById('transposeValue');

  function update() {
    display.textContent = transpose > 0 ? '+' + transpose : String(transpose);
    minusBtn.disabled = transpose <= MIN;
    plusBtn.disabled  = transpose >= MAX;
  }

  minusBtn.addEventListener('click', () => { if (transpose > MIN) { transpose--; update(); } });
  plusBtn.addEventListener('click',  () => { if (transpose < MAX) { transpose++; update(); } });

  update();
}
