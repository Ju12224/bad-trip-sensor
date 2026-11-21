// Trains the quality model: given a reading's measurements, how likely is it to be within 5 bpm of the ECG?
// Logistic regression, tested with 5-fold cross-validation split by person (nobody is in both training and test).
// Usage: node bench/train.js <BUT PPG dir> index.html [out.json]
const fs = require('fs');
const path = require('path');
const { readRecord } = require('./wfdb');
const [root, htmlFile, outFile] = process.argv.slice(2);

const mod = { exports: {} };
new Function('module', fs.readFileSync(htmlFile, 'utf8').match(/<script id="dsp">([\s\S]*?)<\/script>/)[1] +
  ';module.exports.qualityFeatures = qualityFeatures; module.exports.FEATURE_NAMES = FEATURE_NAMES; module.exports.liveLevel = liveLevel;')(mod);
const { liveRead, qualityFeatures, FEATURE_NAMES } = mod.exports;

const csv = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).map(l => l.split(','));
const ann = {}; csv('quality-hr-ann.csv').slice(1).forEach(r => { ann[r[0]] = { quality: +r[1], hr: +r[2] }; });
const info = {}; csv('subject-info.csv').slice(1).forEach(r => { info[r[0]] = { place: r[5], motion: r[6] }; });

// ---- Build the table: one row per finger clip that produced a rate ----
const data = [];
for (const id of fs.readdirSync(root).filter(d => /^\d{6}$/.test(d)).sort()) {
  if (!info[id] || info[id].place !== '1') continue;
  const rec = readRecord(path.join(root, id), id + '_PPG');
  const n = rec.channels[0].length, T = Array.from({ length: n }, (_, i) => i / rec.fs);
  const S = rec.channels.length === 1
    ? [Array.from(rec.channels[0], v => Math.abs(v)), new Array(n).fill(0), new Array(n).fill(0)]
    : rec.channels.slice(0, 3).map(c => Array.from(c));
  const r = liveRead(T, S, ['red', 'green', 'blue']);
  if (r.error || r.bpm === undefined || !r.comb) continue;
  data.push({ id, person: id.slice(0, 3), x: qualityFeatures(r), y: process.env.TARGET === 'quality' ? ann[id].quality : (Math.abs(r.bpm - ann[id].hr) <= 5 ? 1 : 0), right: Math.abs(r.bpm - ann[id].hr) <= 5 ? 1 : 0,
    level: r.level, motion: (info[id].motion || '').split(';')[0], quality: ann[id].quality });
}
console.log('finger clips with a rate:', data.length, ' right within 5 bpm:', data.filter(d => d.y).length);

// ---- Logistic regression ----
const D = FEATURE_NAMES.length;
function fit(rows, lambda) {
  const mu = new Array(D).fill(0), sd = new Array(D).fill(0);
  rows.forEach(r => r.x.forEach((v, j) => { mu[j] += v / rows.length; }));
  rows.forEach(r => r.x.forEach((v, j) => { sd[j] += (v - mu[j]) ** 2 / rows.length; }));
  for (let j = 0; j < D; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const Z = rows.map(r => r.x.map((v, j) => (v - mu[j]) / sd[j]));
  let w = new Array(D).fill(0), b = 0;
  const lr = 0.1;
  for (let it = 0; it < 3000; it++) {
    const gw = new Array(D).fill(0); let gb = 0;
    for (let i = 0; i < rows.length; i++) {
      let z = b; for (let j = 0; j < D; j++) z += w[j] * Z[i][j];
      const e = 1 / (1 + Math.exp(-z)) - rows[i].y;
      gb += e; for (let j = 0; j < D; j++) gw[j] += e * Z[i][j];
    }
    b -= lr * gb / rows.length;
    for (let j = 0; j < D; j++) w[j] -= lr * (gw[j] / rows.length + lambda * w[j]);
  }
  return { mu, sd, w, b };
}
const predict = (m, x) => { let z = m.b; for (let j = 0; j < D; j++) z += m.w[j] * (x[j] - m.mu[j]) / m.sd[j]; return 1 / (1 + Math.exp(-z)); };

// ---- Cross-validation by person ----
const people = [...new Set(data.map(d => d.person))].sort();
const fold = {}; people.forEach((p, i) => { fold[p] = i % 5; });
for (const lambda of [0.001, 0.01, 0.1]) {
  const oof = new Array(data.length);
  for (let f = 0; f < 5; f++) {
    const m = fit(data.filter(d => fold[d.person] !== f), lambda);
    data.forEach((d, i) => { if (fold[d.person] === f) oof[i] = predict(m, d.x); });
  }
  data.forEach((d, i) => { d['p' + lambda] = oof[i]; });
}

// ---- Compare with the current gate ----
const show = (rows, name) => {
  const right = rows.filter(d => d.right).length;
  console.log(name.padEnd(46), 'shown ' + String(rows.length).padStart(4), ' right ' + String(right).padStart(4), ' (' + (rows.length ? Math.round(100 * right / rows.length) : 0) + '% right)');
};
console.log('\n-- tested on people the model never saw --');
show(data.filter(d => d.level === 'clear' || d.level === 'weak'), 'current gate (clear or weak)');
show(data.filter(d => d.level === 'clear'), 'current gate (clear only)');
for (const lambda of [0.001, 0.01, 0.1]) {
  const key = 'p' + lambda;
  for (const th of [0.5, 0.6, 0.7, 0.8, 0.9]) show(data.filter(d => d[key] >= th), `model (L2 ${lambda}), probability >= ${th}`);
}
// Precision-at-coverage: for the middle lambda, the best threshold reaching 90% and 95% right.
const key = 'p0.01';
const sorted = data.slice().sort((a, b) => b[key] - a[key]);
for (const target of [0.9, 0.95]) {
  let best = null, right = 0;
  sorted.forEach((d, i) => { right += d.right; if (right / (i + 1) >= target && i >= 20) best = { n: i + 1, right, th: d[key] }; });
  console.log(`model reaching ${target * 100}% right: ` + (best ? `shown ${best.n}, right ${best.right}, threshold ${best.th.toFixed(2)}` : 'not reached'));
}

// ---- By movement, at the 0.7 threshold ----
const MOTION = { 0: 'rest', 1: 'pressing harder', 2: 'finger sliding', 3: 'walking', 4: 'coughing', 5: 'laughing', 6: 'light changing', 7: 'talking' };
console.log('\n-- by movement: current gate vs model at probability >= 0.7 (people unseen) --');
for (const k of Object.keys(MOTION)) {
  const set = data.filter(d => d.motion === k);
  const a = set.filter(d => d.level === 'clear' || d.level === 'weak'), b = set.filter(d => d[key] >= 0.7);
  const pr = s => s.length ? Math.round(100 * s.filter(d => d.right).length / s.length) + '%' : '-';
  console.log(MOTION[k].padEnd(16), 'current: ' + String(a.length).padStart(3) + ' shown, ' + pr(a).padStart(4) + ' right |  model: ' + String(b.length).padStart(3) + ' shown, ' + pr(b).padStart(4) + ' right');
}

// ---- Final model on everyone, for the page ----
const final = fit(data, 0.01);
console.log('\n-- weights (standardized), largest first --');
FEATURE_NAMES.map((n, j) => [n, final.w[j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).forEach(([n, w]) => console.log(n.padEnd(12), w.toFixed(3)));
const round = a => a.map(v => +v.toFixed(5));
const out = { names: FEATURE_NAMES, mu: round(final.mu), sd: round(final.sd), w: round(final.w), b: +final.b.toFixed(5), trainedOn: data.length };
if (outFile) fs.writeFileSync(outFile, JSON.stringify(out));
console.log('\nmodel:', JSON.stringify(out));
