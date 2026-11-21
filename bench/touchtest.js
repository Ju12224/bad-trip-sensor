// Thumb test analysis: does the touch size (or force) the browser reports wobble with the heartbeat?
// Uses the camera's beats (finger on the back lens) as the clock, like beatlock.js.
// Usage: node bench/touchtest.js <recording.json> index.html
const fs = require('fs');
const [recFile, htmlFile] = process.argv.slice(2);
const mod = { exports: {} };
new Function('module', fs.readFileSync(htmlFile, 'utf8').match(/<script id="dsp">([\s\S]*?)<\/script>/)[1])(mod);
const { analyze } = mod.exports;
const R = JSON.parse(fs.readFileSync(recFile, 'utf8'));
if (!R.touch || !R.touch.length) { console.log('no touch data in this recording'); process.exit(); }

const tc = R.touch, dur = tc[tc.length - 1][0] - tc[0][0];
console.log(`touch readings: ${tc.length} over ${dur.toFixed(1)} s (${(tc.length / Math.max(dur, 0.001)).toFixed(1)} per second)`);
const types = {}; tc.forEach(r => { types[r[7]] = (types[r[7]] || 0) + 1; });
console.log('event types:', JSON.stringify(types), '(s start, m move, e end, c cancel)');
for (const [name, col] of [['radiusX', 3], ['radiusY', 4], ['force', 5], ['x', 1], ['y', 2]]) {
  const v = tc.map(r => r[col]).filter(x => x !== null);
  const distinct = [...new Set(v)].sort((a, b) => a - b);
  const steps = distinct.slice(1).map((d, i) => d - distinct[i]).filter(s => s > 0);
  console.log(`${name.padEnd(8)} ${distinct.length} distinct values` + (distinct.length ? `, range ${distinct[0]} to ${distinct[distinct.length - 1]}, smallest step ${steps.length ? Math.min(...steps).toFixed(4) : '-'}` : ''));
}

// Camera beats over the touch period.
const t0 = R.cam0 != null ? R.cam0 : R.T[0];
const idx = R.T.map((t, i) => i).filter(i => R.T[i] >= t0 + tc[0][0] && R.T[i] <= t0 + tc[tc.length - 1][0]);
const r = idx.length > 240 ? analyze(idx.map(i => R.T[i]), R.S.map(s => idx.map(i => s[i])), R.names) : { error: 'short' };
if (!r.beats) { console.log('\ncamera gave no beats over the touch period (' + (r.error || r.level) + '), so no heartbeat comparison'); process.exit(); }
const beats = r.beats.map(b => R.T[idx[0]] + r.t0 + b / 30 - t0);
console.log(`\ncamera: ${r.bpm.toFixed(1)} bpm, ${beats.length} beats, level ${r.level}`);

// Touch values only change when an event fires, so hold the last value between events.
const tt = tc.map(x => x[0]);
const holdAt = (t, col) => { let lo = 0, hi = tt.length - 1; if (t < tt[0]) return null; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tt[m] <= t) lo = m; else hi = m; } return tc[tt[hi] <= t ? hi : lo][col]; };
let seed = 2; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const PRE = 0.3, NP = 50, STEP = 0.02;
function locked(times, col) {
  const avg = new Float64Array(NP); let n = 0;
  for (const b of times) {
    const seg = []; for (let k = 0; k < NP; k++) seg.push(holdAt(b - PRE + k * STEP, col));
    if (seg.some(v => v === null)) continue;
    const m = seg.reduce((a, c) => a + c, 0) / NP; seg.forEach((v, k) => { avg[k] += v - m; }); n++;
  }
  for (let k = 0; k < NP; k++) avg[k] /= n || 1;
  return Math.sqrt(avg.reduce((a, v) => a + v * v, 0) / NP);
}
console.log('\nvalue     heartbeat-locked wobble   random 95th   ratio   verdict');
for (const [name, col] of [['radiusX', 3], ['radiusY', 4], ['force', 5]]) {
  if (tc.every(x => x[col] === null || x[col] === tc[0][col])) { console.log(name.padEnd(9), 'never changed, nothing to test'); continue; }
  const real = locked(beats, col), lo = beats[0], hi = beats[beats.length - 1], rand = [];
  for (let s = 0; s < 200; s++) rand.push(locked(beats.map(() => lo + rnd() * (hi - lo)), col));
  rand.sort((a, b) => a - b);
  const ratio = real / (rand[190] || 1e-9);
  console.log(name.padEnd(9), real.toFixed(5).padEnd(25), rand[190].toFixed(5).padEnd(13), ratio.toFixed(2).padStart(5), '  ', ratio > 1.5 ? 'heartbeat shows' : ratio > 1 ? 'maybe' : 'no');
}
