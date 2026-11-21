// Writes a synthetic recording in the live page's format, to test replay.js end to end.
// Usage: node bench/fakerecording.js out.json
const fs = require('fs');
let seed = 4;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function gauss() { return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd()); }
function beat(f) { return Math.exp(-((f - 0.15) ** 2) / 0.006) + 0.35 * Math.exp(-((f - 0.45) ** 2) / 0.01); }
const cam0 = 37.5, T = [], S = Array.from({ length: 30 }, () => []), M = [];
let t = cam0, ph = 0;
while (t < cam0 + 60) {
  t += 1 / (29 + 2 * rnd()); ph += 84 / 60 / 30;
  const moving = t - cam0 > 40, hb = 4 * beat((84 / 60 * (t - cam0)) % 1);
  const base = 215 + (moving ? 15 * Math.sin(t * 5) + 5 * gauss() : 0);
  T.push(+t.toFixed(4));
  S[0].push(+(base - hb + 0.5 * gauss()).toFixed(2)); S[1].push(1); S[2].push(26);
  for (let c = 0; c < 9; c++) { S[3 + c].push(+(base + 4 * (c - 4) - hb * 0.8 + 0.7 * gauss()).toFixed(2)); S[12 + c].push(1); S[21 + c].push(26); }
}
for (let mt = 0; mt < 60; mt += 1 / 60) {
  const mv = mt > 40;
  const ax = 0.02 * gauss() + (mv ? 2 * Math.sin(mt * 5) : 0), ay = 0.02 * gauss(), az = 0.02 * gauss();
  const gx = 1 + gauss() + (mv ? 80 * Math.sin(mt * 4) : 0), gy = gauss(), gz = gauss();
  M.push([+mt.toFixed(4), ax, ay, az, gx, gy, gz, Math.hypot(ax, ay, az), Math.hypot(gx, gy, gz)].map(v => +(+v).toFixed(3)));
}
const names = ['red, whole frame', 'green, whole frame', 'blue, whole frame'];
['red', 'green', 'blue'].forEach(c => ['top left', 'top', 'top right', 'left', 'center', 'right', 'bottom left', 'bottom', 'bottom right'].forEach(p => names.push(c + ', ' + p)));
fs.writeFileSync(process.argv[2], JSON.stringify({ what: 'Bad Trip raw recording (synthetic)', version: 1, startedAt: new Date().toISOString(), browser: 'node', camera: 'fake',
  video: '480x640', clock: 'camera capture time', fps: 30, motion: 'on', names, neck: '84', room: 'lit room', cam0, T, S, M,
  motionColumns: ['t', 'ax', 'ay', 'az', 'gx', 'gy', 'gz', 'shake', 'turn'], pageReadings: [] }));
console.log('wrote', process.argv[2], (fs.statSync(process.argv[2]).size / 1024).toFixed(0), 'KB');
