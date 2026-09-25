// Every sample and exercise must cite only the public CROR 2025 document, and its links must still match it.
//   node exercises/check.mjs   (exit 1 on any unresolved reference or drifted link)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { index } from '../src/reader/doc.js';
import { checkSource, linkSource } from '../src/reader/linkcheck.js';
const FIX = process.argv.includes('--fix'); // rewrite sources with fresh cror: links first
import { parseTest } from '../src/txt.js';

const ix = index(JSON.parse(readFileSync(new URL('../documents/cror-2025.json', import.meta.url), 'utf8')));
let bad = 0;
for (const dir of ['samples', 'exercises']) for (const f of readdirSync(new URL(`../${dir}/`, import.meta.url)).filter((x) => x.endsWith('.txt'))) {
  let src = readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8');
  if (FIX) { src = linkSource(ix, src).source; writeFileSync(new URL(`../${dir}/${f}`, import.meta.url), src); }
  const { errors } = await parseTest(src);
  const rows = checkSource(ix, src); const problems = rows.filter((r) => r.status !== 'ok' || r.unresolved.length);
  console.log(`${dir}/${f}: ${rows.length} items, ${rows.filter((r) => r.status === 'ok').length} linked ok${errors.length ? `, ${errors.length} parse errors` : ''}${problems.length ? `, ${problems.length} problems` : ''}`);
  for (const p of problems) { bad++; console.log(`  item ${p.item} ${p.id || ''}: ${p.status}${p.unresolved.length ? ' — cannot resolve ' + p.unresolved.join(', ') : ''}${p.links.filter((l) => l.status !== 'ok').map((l) => ` — ${l.id} ${l.status}`).join('')}`); }
  bad += errors.length;
}
process.exit(bad ? 1 : 0);
