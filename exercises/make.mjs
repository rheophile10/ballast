// Generate the built-in exercises from public sources only: the signal aspects table (Transport Canada CROR 2025
// diagrams, hand-transcribed) and the CROR 2025 document itself. Every item is linked to the rulebook by node@hash.
//   node exercises/make.mjs   → exercises/signals.txt, exercises/definitions.txt
import { readFileSync, writeFileSync } from 'node:fs';
import { index } from '../src/reader/doc.js';
import { linkSource } from '../src/reader/linkcheck.js';

const doc = JSON.parse(readFileSync(new URL('../documents/cror-2025.json', import.meta.url), 'utf8')); const ix = index(doc);
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const same = (x, y) => x === y || (x?.name !== undefined && x.name === y?.name) || (x?.title !== undefined && x.title === y?.title);
const pick = (r, arr, n, not) => { const pool = arr.filter((x) => !same(x, not)); const out = []; while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]); return out; };
const mc = (r, prompt, correct, wrong, extra) => { const opts = [correct, ...wrong]; for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; } return [`Q: ${prompt}`, ...opts.map((o, i) => `${o === correct ? '*' : ''}${'abcd'[i]}) ${o}`), ...extra].join('\n'); };

// ---------- signals: the aspects a crew member must read, drawn by Ballast from the colour table
const csv = readFileSync(new URL('./signal-aspects.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => { const c = l.match(/("([^"]*)"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '')); return { rule: c[0], name: c[1], form: c[2], top: c[3], middle: c[4], bottom: c[5], plate: c[6], indication: c[7] }; });
const lamp = { green: 'G', yellow: 'Y', red: 'R', 'flashing green': 'Gf', 'flashing yellow': 'Yf', 'flashing red': 'Rf', lunar: 'L', white: 'L', dark: 'x', '': null };
const aspects = []; const seen = new Set();
for (const row of csv) {
  const heads = [row.top, row.middle, row.bottom].map((c) => lamp[c.toLowerCase()] ?? undefined);
  if (heads.includes(undefined)) continue; const hs = heads.filter(Boolean); if (!hs.length) continue;
  const spec = `signal ${hs.join(',')}${row.plate ? ' ' + row.plate : ''}${/low/.test(row.form) ? ' low' : ''}`;
  const key = `${row.rule}|${spec}`; if (seen.has(key)) continue; seen.add(key);
  if (!ix.get(row.rule)) continue; // only aspects the public rulebook has
  aspects.push({ ...row, spec });
}
const byRule = new Map(); for (const a of aspects) if (!byRule.has(a.rule)) byRule.set(a.rule, a);
const names = [...new Set(aspects.map((a) => a.name))]; const inds = [...byRule.values()];
const r1 = rng(405); const items = [];
aspects.forEach((a, k) => items.push(mc(r1, `Which signal indication is this?`, a.name, pick(r1, names, 3, a.name), [`id: asp-${a.rule}-${k + 1}`, `svg: ${a.spec}`, `area: aspects`, `ref: CROR ${a.rule}`, `tags: signals aspect`])));
const r2 = rng(406);
for (const a of inds) items.push(mc(r2, `${a.name} (Rule ${a.rule}) — what does it require?`, a.indication, pick(r2, inds, 3, a).map((x) => x.indication), [`id: ind-${a.rule}`, `area: indications`, `ref: CROR ${a.rule}`, `tags: signals indication`]));
const head = `# Signals — aspects and indications\ntime: 90m\npass: 90%\nshuffle: items options\nback: yes\ncror: open\nareas: aspects "Reading aspects" · indications "Indications"\n`;
const signals = linkSource(ix, head + '---\n' + items.join('\n---\n') + '\n');
writeFileSync(new URL('./signals.txt', import.meta.url), signals.source);

// ---------- definitions: term ↔ meaning, from the document
const defs = doc.nodes.filter((n) => n.kind === 'definition' && n.text.length >= 40 && n.text.length <= 260);
const r3 = rng(1); const ditems = [];
for (const d of defs) ditems.push(mc(r3, `Which term does the CROR define as: “${d.text}”`, d.title, pick(r3, defs, 3, d).map((x) => x.title), [`id: ${d.id.replace(':', '-')}`, `area: definitions`, `ref: CROR ${d.title}`, `tags: definitions`]));
const dhead = `# Definitions\ntime: 60m\npass: 90%\nshuffle: items options\nback: yes\ncror: open\nareas: definitions "Definitions"\n`;
const definitions = linkSource(ix, dhead + '---\n' + ditems.join('\n---\n') + '\n');
writeFileSync(new URL('./definitions.txt', import.meta.url), definitions.source);
const bad = [...signals.report, ...definitions.report].filter((x) => x.unresolved.length);
console.log(`signals.txt: ${items.length} items (${aspects.length} aspects, ${inds.length} indications); definitions.txt: ${ditems.length} items; unresolved: ${bad.length}`);
if (bad.length) { console.error(bad); process.exit(1); }
