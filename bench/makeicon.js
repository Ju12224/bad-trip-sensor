// Draws the home-screen icon as a PNG with no libraries: a dark background with a glowing red pulse dot
// and a heartbeat line. Usage: node bench/makeicon.js <size> <out.png>
const fs = require('fs');
const zlib = require('zlib');
const size = +process.argv[2] || 180, out = process.argv[3] || 'icon.png';

const px = Buffer.alloc(size * size * 4);
const bg = [21, 11, 12], ember = [255, 91, 58];
const line = x => { // heartbeat trace: flat, spike, dip, flat (in 0..1 units)
  const u = x / size;
  if (u < 0.30 || u > 0.78) return 0.62;
  if (u < 0.42) return 0.62 - (u - 0.30) * 0.5;
  if (u < 0.50) return 0.56 - (u - 0.42) * 4.0;
  if (u < 0.60) return 0.24 + (u - 0.50) * 6.4;
  if (u < 0.68) return 0.88 - (u - 0.60) * 3.25;
  return 0.62;
};
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const i = (y * size + x) * 4, dx = x / size - 0.5, dy = y / size - 0.5, r = Math.hypot(dx, dy);
  let c = bg.slice();
  const glow = Math.max(0, 1 - r / 0.42) ** 2 * 0.35;       // soft red glow in the middle
  c = c.map((v, k) => v + (ember[k] - v) * glow);
  // distance from the heartbeat line (approximate by checking nearby x)
  let d = 1;
  for (let k = -6; k <= 6; k++) { const xx = x + k, yy = line(xx) * size; d = Math.min(d, Math.hypot(k, y - yy) / size); }
  const w = 0.028;
  if (d < w) { const a = Math.min(1, (w - d) / 0.008); c = c.map((v, k) => v + (ember[k] - v) * a); }
  px[i] = Math.round(c[0]); px[i + 1] = Math.round(c[1]); px[i + 2] = Math.round(c[2]); px[i + 3] = 255;
}
const raw = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out, size + 'x' + size);
