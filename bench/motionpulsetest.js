// Simulated motion-sensor data at about 60 Hz: does the motion pulse reader find a tiny heartbeat jolt?
// Usage: node bench/motionpulsetest.js index.html
const fs = require('fs');
const mod = { exports: {} };
new Function('module', fs.readFileSync(process.argv[2], 'utf8').match(/<script id="dsp">([\s\S]*?)<\/script>/)[1])(mod);
const { motionPulse } = mod.exports;
let seed = 9;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function gauss() { return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd()); }
// A ballistocardiogram-like jolt per beat: a quick down-up-down wiggle lasting about 0.2 s.
function jolt(f) { const t = f * 1; return t < 0.25 ? Math.sin(2 * Math.PI * t / 0.083) * Math.exp(-t / 0.06) : 0; }
function run(name, bpm, joltAmp, noise, sway) {
  const M = []; let t = 0, out = [];
  while (t < 30) {
    t += 1 / (55 + 10 * rnd());
    const ph = (t * bpm / 60) % 1, beatT = ph * 60 / bpm;
    const j = bpm ? joltAmp * jolt(beatT) : 0;
    const sw = sway * Math.sin(2 * Math.PI * 0.3 * t);      // slow hand sway
    const s = { t, ax: noise * gauss() + 0.3 * j + sw, ay: noise * gauss() + j, az: noise * gauss() + sw, gx: 20 * noise * gauss() + 30 * j, gy: 20 * noise * gauss(), gz: 20 * noise * gauss() };
    s.a = Math.hypot(s.ax, s.ay, s.az); s.g = Math.hypot(s.gx, s.gy, s.gz);
    M.push(s);
    while (M.length && M[0].t < t - 15) M.shift();
    if (t > 12 && out.length < Math.floor(t) - 11) { const p = motionPulse(M, t); out.push(p ? Math.round(p.bpm) + '(' + p.q.toFixed(2) + ' ' + p.axis + ')' : '-'); }
  }
  console.log(name.padEnd(36), out.slice(0, 8).join(' '));
}
run('72 bpm, clear jolts', 72, 0.05, 0.01, 0.02);
run('72 bpm, jolts at noise level', 72, 0.02, 0.01, 0.05);
run('95 bpm, faint jolts', 95, 0.01, 0.01, 0.05);
run('no heartbeat, noise and sway', 0, 0, 0.01, 0.05);
