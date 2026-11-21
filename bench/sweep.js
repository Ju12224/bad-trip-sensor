// Which gate on strength, sharpness and halves/thirds agreement best separates right readings from wrong ones?
// Each finger clip with a reading is labelled right if within 5 bpm of the ECG.
const fs = require('fs');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter(r => r.place === '1' && r.bpm !== null);
const ok = r => Math.abs(r.bpm - r.ref) <= 5;
console.log('finger clips with a reading:', rows.length, ' right:', rows.filter(ok).length);
const res = [];
for (const q of [0.35, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7])
  for (const c of [5, 8, 12, 16, 20, 30])
    for (const [hd, td] of [[8, 10], [5, 6], [3, 4], [2, 3]]) {
      const shown = rows.filter(r => r.q >= q && r.c >= c && r.hd <= hd && r.td <= td);
      const right = shown.filter(ok).length;
      res.push({ q, c, hd, td, shown: shown.length, right, prec: shown.length ? right / shown.length : 0 });
    }
const fmt = r => `strength>=${r.q} sharp>=${r.c} halves<=${r.hd} thirds<=${r.td}: shown ${r.shown}, right ${r.right} (${(100 * r.prec).toFixed(0)}%)`;
console.log('\n-- gates reaching 95% right, most readings first --');
res.filter(r => r.prec >= 0.95).sort((a, b) => b.right - a.right).slice(0, 8).forEach(r => console.log(fmt(r)));
console.log('\n-- gates reaching 90% right --');
res.filter(r => r.prec >= 0.90).sort((a, b) => b.right - a.right).slice(0, 5).forEach(r => console.log(fmt(r)));
console.log('\n-- current weak gate (35%, sharp 8, halves 8, thirds 10) --');
console.log(fmt(res.find(r => r.q === 0.35 && r.c === 8 && r.hd === 8)));
// How do wrong readings look?
const wrongShown = rows.filter(r => r.q >= 0.35 && r.c >= 8 && r.hd <= 8 && r.td <= 10 && !ok(r));
const ratio = wrongShown.map(r => r.bpm / r.ref);
const bins = { 'about half': 0, 'about double': 0, 'low (0.6-0.9x)': 0, 'high (1.1-1.6x)': 0, other: 0 };
ratio.forEach(x => { if (x > 0.45 && x < 0.55) bins['about half']++; else if (x > 1.8 && x < 2.2) bins['about double']++; else if (x >= 0.6 && x < 0.95) bins['low (0.6-0.9x)']++; else if (x > 1.05 && x <= 1.6) bins['high (1.1-1.6x)']++; else bins.other++; });
console.log('\nwrong readings under the current gate:', wrongShown.length, bins);
