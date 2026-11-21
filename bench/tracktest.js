// Simulated live runs through the reader, the tracker and the motion check, one step per second.
// Usage: node bench/tracktest.js index.html
const fs = require('fs');
const mod = { exports: {} };
new Function('module', fs.readFileSync(process.argv[2], 'utf8').match(/<script id="dsp">([\s\S]*?)<\/script>/)[1])(mod);
const { liveRead, createTracker, trackStep, motionSummary } = mod.exports;
const NAMES = Array.from({ length: 30 }, (_, i) => 's' + i);

let seed = 5;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function gauss() { return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd()); }
function beat(f, a) { return a * Math.exp(-((f - 0.15) ** 2) / 0.006) + 0.35 * a * Math.exp(-((f - 0.45) ** 2) / 0.01); }

// opts: rate(t) bpm, amp, noise, alt (every other beat weaker), burst [from,to] of heavy pressure noise,
// motionRate (steps/min shaking both the phone and the fingertip), motionAmp, moving [from,to].
function run(name, o) {
  const T = [], S = Array.from({ length: 30 }, () => []), M = [], tk = createTracker();
  let t = 0, ph = 0, next = 1, out = [], wrong = 0, shown = 0;
  while (t < (o.secs || 45)) {
    const dt = 1 / (28 + 4 * rnd()); t += dt;
    const rate = o.rate(t); ph += rate / 60 * dt;
    const k = Math.floor(ph), f = ph - k;
    let hb = o.amp ? beat(f, o.amp * (o.alt && k % 2 ? 0.45 : 1)) : 0;
    let extra = 0;
    if (o.burst && t > o.burst[0] && t < o.burst[1]) extra += 6 * gauss() + 8 * Math.sin(t * 3);
    let mot = 0;
    if (o.motionRate) mot = Math.sin(2 * Math.PI * o.motionRate / 60 * t);
    extra += (o.motionAmp || 0) * mot;
    const base = 215 + extra;
    T.push(t);
    S[0].push(base - hb + o.noise * gauss()); S[1].push(1); S[2].push(26);
    for (let c = 0; c < 9; c++) { S[3 + c].push(base + 4 * (c - 4) - hb * (0.6 + 0.1 * c) + 1.5 * o.noise * gauss()); S[12 + c].push(1); S[21 + c].push(26); }
    // Motion sensor at 60 Hz-ish: still-hand jitter, the motion rhythm, and bigger shaking while "moving".
    const mv = o.moving && t > o.moving[0] && t < o.moving[1];
    M.push({ t, a: Math.abs(0.03 + 0.02 * gauss() + (o.motionRate ? 0.4 * (1 + mot) : 0) + (mv ? 1.5 + gauss() : 0)), g: Math.abs(2 + gauss() + (mv ? 60 : 0)) });
    while (M.length && M[0].t < t - 15) M.shift();
    if (t >= next) {
      const r = liveRead(T, S, NAMES), m = motionSummary(M, t), s = trackStep(tk, r, m, t);
      const code = { clear: 'c', weak: 'w', tracked: 't', held: 'h', unsure: 'u', none: '.', moving: 'M', short: '_', moved: 'v' }[s.state] || '?';
      if (s.bpm !== null && s.state !== 'unsure') { shown++; if (Math.abs(s.bpm - rate) > 5) wrong++; }
      out.push(code + (s.bpm !== null ? Math.round(s.bpm) : ''));
      next++;
    }
  }
  console.log(name.padEnd(34) + `shown ${shown}, wrong ${wrong}\n    ` + out.slice(10).join(' '));
}

run('82, every other beat weak', { rate: () => 82, amp: 4, noise: 0.6, alt: true });
run('82, every other beat weak, noisy', { rate: () => 82, amp: 3, noise: 1.2, alt: true });
run('rises 70 -> 100 from 15 s to 30 s', { rate: t => t < 15 ? 70 : t < 30 ? 70 + 2 * (t - 15) : 100, amp: 4, noise: 0.6 });
run('startle: 75 -> 105 in 4 s at 25 s', { rate: t => t < 25 ? 75 : t < 29 ? 75 + 7.5 * (t - 25) : 105, amp: 4, noise: 0.6 });
run('84, pressure noise 22-27 s', { rate: () => 84, amp: 4, noise: 0.6, burst: [22, 27] });
run('84, phone moving 22-27 s', { rate: () => 84, amp: 4, noise: 0.6, moving: [22, 27] });
run('72, tapping rhythm 110/min', { rate: () => 72, amp: 2, noise: 0.6, motionRate: 110, motionAmp: 3 });
run('no pulse, noise', { rate: () => 0, amp: 0, noise: 1 });
run('no pulse, tapping rhythm 95/min', { rate: () => 0, amp: 0, noise: 0.6, motionRate: 95, motionAmp: 2 });
