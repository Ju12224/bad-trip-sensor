// Summarizes a bench run: how often a number is shown, and how far off it is from the ECG.
const fs = require('fs');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const MOTION = { 0: 'rest', 1: 'pressing harder', 2: 'finger sliding', 3: 'walking', 4: 'coughing', 5: 'laughing', 6: 'light changing', 7: 'talking' };

function stats(set) {
  const n = set.length;
  const shown = set.filter(r => r.level === 'clear' || r.level === 'weak');
  const clear = set.filter(r => r.level === 'clear');
  const unsure = set.filter(r => r.level === 'unsure');
  const errs = shown.map(r => Math.abs(r.bpm - r.ref)).sort((a, b) => a - b);
  const within5 = errs.filter(e => e <= 5).length, half = shown.filter(r => Math.abs(2 * r.bpm - r.ref) <= 5).length;
  const uerr = unsure.filter(r => Math.abs(r.bpm - r.ref) <= 5).length;
  const mae = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : NaN;
  return { n, shown: shown.length, clear: clear.length, within5, half, mae, med: errs.length ? errs[errs.length >> 1] : NaN, p90: errs.length ? errs[Math.floor(errs.length * 0.9)] : NaN, unsure: unsure.length, uok: uerr,
    errMoved: set.filter(r => r.err === 'moved').length, errShort: set.filter(r => r.err === 'short').length };
}
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
function line(name, set) {
  const s = stats(set);
  console.log(name.padEnd(30), String(s.n).padStart(5),
    ' shown ' + pct(s.shown, s.n).padStart(4) + ' (clear ' + pct(s.clear, s.n) + ')',
    ' right±5 ' + pct(s.within5, s.shown).padStart(4),
    ' half-rate ' + String(s.half).padStart(3),
    ' mean err ' + (isNaN(s.mae) ? '-' : s.mae.toFixed(1)).padStart(5),
    ' median ' + (isNaN(s.med) ? '-' : s.med.toFixed(1)),
    ' 90th ' + (isNaN(s.p90) ? '-' : s.p90.toFixed(1)),
    ' | unsure ' + s.unsure + ' (right ' + pct(s.uok, s.unsure) + ')',
    ' | moved ' + s.errMoved + ' short ' + s.errShort);
}
const finger = rows.filter(r => r.place === '1'), ear = rows.filter(r => r.place === '0');
const m0 = r => (r.motion || '').split(';')[0];
console.log('== all clips ==');
line('all', rows);
line('finger', finger);
line('ear', ear);
console.log('== finger, by expert quality label ==');
line('finger, good quality', finger.filter(r => r.quality === 1));
line('finger, poor quality', finger.filter(r => r.quality === 0));
console.log('== finger, by movement ==');
for (const k of Object.keys(MOTION)) line('finger, ' + MOTION[k], finger.filter(r => m0(r) === k));
console.log('== finger, by recording type ==');
line('finger, red only (old)', finger.filter(r => !r.rgb));
line('finger, RGB (new)', finger.filter(r => r.rgb));
line('finger, red median > 250', finger.filter(r => r.redMed > 250));
line('finger, red median <= 250', finger.filter(r => r.redMed <= 250));
