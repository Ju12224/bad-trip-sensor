// Replays a raw recording from the live page through the current reader, tracker and motion code, second by second,
// exactly as the page would. Usage: node bench/replay.js <recording.json> index.html
const fs = require('fs');
const [recFile, htmlFile] = process.argv.slice(2);
const mod = { exports: {} };
new Function('module', fs.readFileSync(htmlFile, 'utf8').match(/<script id="dsp">([\s\S]*?)<\/script>/)[1])(mod);
const { liveRead, createTracker, trackStep, motionSummary, motionPulse } = mod.exports;

const R = JSON.parse(fs.readFileSync(recFile, 'utf8'));
console.log(`${R.what}, ${R.startedAt}, ${R.camera}, ${R.video}, ${R.T.length} frames, ${R.M.length} motion samples, neck ${R.neck || '?'}, ${R.room}`);
// Motion times are seconds since the recording started on the page clock; camera times are on the camera clock.
// cam0 is the camera time when recording started, so camera time = cam0 + motion time.
const cam0 = R.cam0 != null && R.cam0 > 0 ? R.cam0 : R.T[0];
const Mall = R.M.map(r => ({ t: cam0 + r[0], ax: r[1], ay: r[2], az: r[3], gx: r[4], gy: r[5], gz: r[6], a: r[7], g: r[8] }));

const tk = createTracker(), rows = [];
let fi = 0, mi = 0;
const T = [], S = R.S.map(() => []), M = [];
for (let now = R.T[0] + 1; now <= R.T[R.T.length - 1]; now += 1) {
  while (fi < R.T.length && R.T[fi] <= now) { T.push(R.T[fi]); R.S.forEach((s, q) => S[q].push(s[fi])); fi++; }
  while (mi < Mall.length && Mall[mi].t <= now) { M.push(Mall[mi]); mi++; }
  while (M.length && M[0].t < now - 15) M.shift();
  const r = liveRead(T, S, R.names);
  const m = M.length ? motionSummary(M, now) : null;
  const s = trackStep(tk, r, m, now - R.T[0]);
  const mp = m && !m.moving ? motionPulse(M, now) : null;
  rows.push({ sec: Math.round(now - R.T[0]), shown: s.bpm, state: s.state, raw: r.bpm, q: r.q, c: r.c, a: m && m.a, g: m && m.g, mp });
}
const f = (v, d) => v === undefined || v === null ? '-' : (+v).toFixed(d);
rows.forEach(x => console.log(String(x.sec).padStart(3), String(x.state).padEnd(8), f(x.shown, 0).padStart(4), '| raw', f(x.raw, 1).padStart(5), 'q', f(x.q, 2), 'c', f(x.c, 1).padStart(5),
  '| shake', f(x.a, 2), 'turn', f(x.g, 0).padStart(3), '| motion pulse', x.mp ? f(x.mp.bpm, 0) + ' ' + f(x.mp.q, 2) + ' ' + x.mp.axis : '-'));
const shown = rows.filter(x => x.shown !== null && x.state !== 'unsure');
console.log(`\nshown ${shown.length} of ${rows.length} seconds` + (R.neck ? `, within 5 of neck count ${R.neck}: ${shown.filter(x => Math.abs(x.shown - R.neck) <= 5).length}` : ''));
