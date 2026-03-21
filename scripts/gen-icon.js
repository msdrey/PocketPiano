/**
 * Generates icon.png (512x512) — a piano keys illustration on a dark background.
 * Uses only Node.js built-ins (zlib for PNG compression, fs for output).
 */
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

// ── CRC32 (required by PNG chunk format) ──────────────────────────────────────
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : (c >>> 1);
  crcTable[i] = c;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── Image ─────────────────────────────────────────────────────────────────────
const W = 512, H = 512;
const img = Buffer.alloc(W * H * 3); // RGB

function fillRect(x0, y0, w, h, r, g, b) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = (y * W + x) * 3;
      img[i] = r; img[i + 1] = g; img[i + 2] = b;
    }
  }
}

// Background
fillRect(0, 0, W, H, 26, 26, 26);

// Layout matches icon.svg: 7 white keys, 60px wide, 66px spacing, starting x=28, y=80
const PAD_X = 28, PAD_Y = 80;
const KEY_W = 60, KEY_H = 352, KEY_SPACING = 66;
const BLACK_W = 38, BLACK_H = 218;

// White keys
for (let k = 0; k < 7; k++) {
  fillRect(PAD_X + k * KEY_SPACING, PAD_Y, KEY_W, KEY_H, 238, 235, 220);
}

// Black keys — centered in the gap between adjacent white keys
// Boundaries: C#(1), D#(2), F#(4), G#(5), A#(6)
for (const b of [1, 2, 4, 5, 6]) {
  const rightEdgeOfLeft = PAD_X + (b - 1) * KEY_SPACING + KEY_W;
  const leftEdgeOfRight = PAD_X + b * KEY_SPACING;
  const center = (rightEdgeOfLeft + leftEdgeOfRight) / 2;
  fillRect(Math.round(center - BLACK_W / 2), PAD_Y, BLACK_W, BLACK_H, 18, 18, 18);
}

// ── Encode as PNG ─────────────────────────────────────────────────────────────
// Each scanline: 1 filter byte (0 = None) + W*3 RGB bytes
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0; // filter: None
  img.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // color type: RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  sig,
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', deflateSync(raw)),
  pngChunk('IEND', Buffer.alloc(0)),
]);

writeFileSync('icon.png', png);
console.log('Generated icon.png (512x512)');
