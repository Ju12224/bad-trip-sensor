// Does the phone's motion data move with the heartbeat? Uses the camera's beats as the clock: cuts the motion
// signal around every beat and averages. A real heartbeat jolt adds up into a clear shape; noise averages away.
// The same is done at random times to see how big a shape pure noise leaves.
// Usage: node bench/beatlock.js <recording.json> index.html [fromSec toSec]
const fs = require('fs');
const [recFile, htmlFile, fromArg, toArg] = process.argv.slice(2);
const mod = { exports: {} };
new Function('module', fs.readFileSync(htmlFile, 'utf8').match(/<script id="dsp">([\s\S]*?)<\/script>/)[1] + ';module.exports.movAvg=movAvg;')(mod);
const { analyze, movAvg } = mod.exports;
const R = JSON.parse(fs.readFileSync(recFile, 'utf8'));
const t0 = R.T[0], from = t0 + (+fromArg || 6), to = t0 + (+toArg || 49);

// Camera beats over the still stretch.
const idx = R.T.map((t, i) => i).filter(i => R.T[i] >= from && R.T[i] <= to);
const r = analyze(idx.map(i => R.T[i]), R.S.map(s => idx.map(i => s[i])), R.names);
if (!r.beats) { console.log('no camera beats:', r.error || r.level); process.exit(); }
const beatsCam = r.beats.map(b => R.T[idx[0]] + r.t0 + b / 30);
console.log(`camera: ${r.bpm.toFixed(1)} bpm over ${(to - from).toFixed(0)} s, ${beatsCam.length} beats, level ${r.level}`);
// Camera clock -> motion clock (seconds since recording start).
const beats = beatsCam.map(t => t - R.cam0);

const cols = ['ax', 'ay', 'az', 'gx', 'gy', 'gz'];
const mt = R.M.map(m => m[0]);
const hz = (mt.length - 1) / (mt[mt.length - 1] - mt[0]);
const PRE = 0.3, POST = 0.7, STEP = 1 / 50, NP = Math.round((PRE + POST) / STEP);
let seed = 1; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

function interp(t, ys) {
  let lo = 0, hi = mt.length - 1;
  if (t <= mt[0] || t >= mt[hi]) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (mt[m] <= t) lo = m; else hi = m; }
  const f = (t - mt[lo]) / (mt[hi] - mt[lo]); return ys[lo] * (1 - f) + ys[hi] * f;
}
function locked(ys, times) {
  const avg = new Float64Array(NP); let n = 0;
  for (const b of times) {
    const seg = []; let ok = true;
    for (let k = 0; k < NP; k++) { const v = interp(b - PRE + k * STEP, ys); if (v === null) { ok = false; break; } seg.push(v); }
    if (!ok) continue;
    const m = seg.reduce((a, c) => a + c, 0) / NP;
    for (let k = 0; k < NP; k++) avg[k] += seg[k] - m; n++;
  }
  for (let k = 0; k < NP; k++) avg[k] /= n || 1;
  return { avg, n, rms: Math.sqrt(avg.reduce((a, v) => a + v * v, 0) / NP) };
}
console.log(`motion: ${hz.toFixed(1)} samples/s; averaging ${beats.length} beats vs 200 sets of random times\n`);
console.log('axis    heartbeat shape size   random sets: median  95th    ratio to 95th   verdict');
for (let c = 0; c < cols.length; c++) {
  let ys = R.M.map(m => m[1 + c]);
  if (ys.some(v => v === null)) continue;
  // Remove slow sway (1.5 s moving average) so only quick movement is left.
  const w = Math.round(1.5 * hz) | 1, slow = movAvg(ys, w);
  ys = ys.map((v, i) => v - slow[i]);
  const real = locked(ys, beats);
  const lo = beats[0], hi = beats[beats.length - 1];
  const rand = [];
  for (let s = 0; s < 200; s++) rand.push(locked(ys, beats.map(() => lo + rnd() * (hi - lo))).rms);
  rand.sort((a, b) => a - b);
  const p50 = rand[100], p95 = rand[190], ratio = real.rms / p95;
  const unit = c < 3 ? 'm/s²' : '°/s';
  console.log(cols[c].padEnd(7), (real.rms.toFixed(4) + ' ' + unit).padEnd(22), p50.toFixed(4).padEnd(8), p95.toFixed(4).padEnd(8), ratio.toFixed(2).padStart(6), '        ', ratio > 1.5 ? 'heartbeat shows' : ratio > 1 ? 'maybe' : 'no');
  if (ratio > 1) console.log('        shape (every 0.1 s from 0.3 s before the camera beat):', Array.from(real.avg).filter((_, k) => k % 5 === 0).map(v => v.toFixed(4)).join(' '));
}
