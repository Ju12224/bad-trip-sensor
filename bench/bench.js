// Scores the page's live reader on every BUT PPG clip against the ECG heart rate.
// Usage: node bench.js <dataset root> <index.html> <out.json> [variant]
// variant "nosat": let the reader use a series even when its median is above 250 (most old clips sit at 254).
const fs = require('fs');
const path = require('path');
const { readRecord } = require('./wfdb');
const [root, htmlFile, outFile, variant] = process.argv.slice(2);

let src = fs.readFileSync(htmlFile, 'utf8').match(/<script id="dsp">([\s\S]*?)<\/script>/)[1];
if (variant === 'nosat') {
  if (!src.includes('if (med > 250 || med < 2) continue;')) throw new Error('saturation line not found');
  src = src.replace('if (med > 250 || med < 2) continue;', 'if (med > 255.5 || med < 2) continue;');
}
const mod = { exports: {} };
new Function('module', src)(mod);
const { liveRead } = mod.exports;

const csv = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).map(l => l.split(','));
const ann = {}; csv('quality-hr-ann.csv').slice(1).forEach(r => { ann[r[0]] = { quality: +r[1], hr: +r[2] }; });
const info = {}; csv('subject-info.csv').slice(1).forEach(r => { info[r[0]] = { place: r[5], motion: r[6] }; });

const recs = fs.readdirSync(root).filter(d => /^\d{6}$/.test(d)).sort();
const NAMES = ['red', 'green', 'blue'];
const rows = [];
let t0 = Date.now();
for (const id of recs) {
  let rec;
  try { rec = readRecord(path.join(root, id), id + '_PPG'); } catch (e) { rows.push({ id, err: 'read: ' + e.message }); continue; }
  const n = rec.channels[0].length, fsr = rec.fs;
  const T = Array.from({ length: n }, (_, i) => i / fsr);
  // Old clips store red inverted (-255..0); new clips store R, G, B as 0..255.
  let S;
  if (rec.channels.length === 1) {
    const red = Array.from(rec.channels[0], v => v < 0 ? -v : v);
    S = [red, new Array(n).fill(0), new Array(n).fill(0)];
  } else S = rec.channels.slice(0, 3).map(c => Array.from(c));
  const r = liveRead(T, S, NAMES);
  rows.push({
    id, ref: ann[id] && ann[id].hr, quality: ann[id] && ann[id].quality, place: info[id] && info[id].place, motion: info[id] && info[id].motion,
    rgb: rec.channels.length === 3, redMed: +[...S[0]].sort((a, b) => a - b)[n >> 1].toFixed(1),
    err: r.error || null, level: r.error ? 'error' : r.level, spec: r.specLevel || null,
    bpm: r.bpm !== undefined ? +r.bpm.toFixed(1) : null, q: r.q !== undefined ? +r.q.toFixed(3) : null, c: r.c !== undefined ? +r.c.toFixed(1) : null,
    hd: r.hd !== undefined ? +r.hd.toFixed(1) : null, td: r.td !== undefined ? +r.td.toFixed(1) : null
  });
}
fs.writeFileSync(outFile, JSON.stringify(rows));
console.log(variant || 'as-is', rows.length, 'clips in', ((Date.now() - t0) / 1000).toFixed(0), 's');
