// Minimal reader for the BUT PPG WFDB files (format 16 only).
// Two layouts exist: old records store 300 one-sample "signals" (one per frame, each with its own gain);
// new records store 3 signals (R, G, B) of 300 samples, interleaved.
const fs = require('fs');
const path = require('path');

function parseHeader(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'));
  const [name, nsig, fs_, nsamp] = lines[0].trim().split(/\s+/);
  const sigs = lines.slice(1, 1 + +nsig).map(l => {
    const p = l.trim().split(/\s+/);
    const m = p[2].match(/^([-\d.eE+]+)(?:\(([-\d]+)\))?/);
    return { file: p[1], fmt: p[1] && p[1], format: p[1] ? +p[1] : 16, gain: +m[1] || 200, baseline: m[2] !== undefined ? +m[2] : 0, desc: p[8] || '' };
  });
  // p[1] above is the .dat name; format is the next token
  lines.slice(1, 1 + +nsig).forEach((l, i) => { sigs[i].format = +l.trim().split(/\s+/)[1]; sigs[i].file = l.trim().split(/\s+/)[0]; });
  return { name, nsig: +nsig, fs: +fs_, nsamp: nsamp === undefined ? 1 : +nsamp, sigs };
}

// Returns { fs, channels: [Float64Array...] } in physical units.
function readRecord(dir, rec) {
  const h = parseHeader(path.join(dir, rec + '.hea'));
  const buf = fs.readFileSync(path.join(dir, h.sigs[0].file));
  if (h.sigs.some(s => s.format !== 16)) throw new Error('unsupported format in ' + rec);
  const raw = new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
  if (h.nsamp === 1 && h.nsig > 3) {
    // Old layout: each "signal" is one frame.
    const out = new Float64Array(h.nsig);
    for (let i = 0; i < h.nsig; i++) out[i] = (raw[i] - h.sigs[i].baseline) / h.sigs[i].gain;
    return { fs: h.fs, names: ['PPG_R'], channels: [out] };
  }
  const n = h.nsamp, chans = h.sigs.map(() => new Float64Array(n));
  for (let t = 0; t < n; t++) for (let c = 0; c < h.nsig; c++) chans[c][t] = (raw[t * h.nsig + c] - h.sigs[c].baseline) / h.sigs[c].gain;
  return { fs: h.fs, names: h.sigs.map(s => s.desc), channels: chans };
}

module.exports = { readRecord, parseHeader };
