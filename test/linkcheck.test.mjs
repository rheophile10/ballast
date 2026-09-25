import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { index } from '../src/reader/doc.js';
import { linkSource, checkSource } from '../src/reader/linkcheck.js';
import { parseTest, publicItem } from '../src/txt.js';

const ix = index(JSON.parse(await readFile(new URL('../documents/cror-2025.json', import.meta.url), 'utf8')));
const src = `# T\ncror: open\n---\nQ: q1\n*a) x\nb) y\nref: CROR 27(b), CROR Slow Speed\n---\nQ: q2\n*a) x\nb) y\nref: GOI 8.1\n---\nQ: q3\n*a) x\nb) y\n`;

test('linkSource adds cror: lines from ref: lines; checkSource reports ok/changed/missing/unlinked; links never reach crew', async () => {
  const { source, report } = linkSource(ix, src);
  assert.match(source, /ref: CROR 27\(b\), CROR Slow Speed\ncror: 27\(b\)@[0-9a-f]{12} def:slow-speed@[0-9a-f]{12}/);
  assert.deepEqual(report[1].unresolved, ['GOI 8.1']);
  const rows = checkSource(ix, source); assert.deepEqual(rows.map((r) => r.status), ['ok', 'unlinked', 'no-ref']);
  const drift = checkSource(ix, source.replace(/27\(b\)@[0-9a-f]{12}/, '27(b)@000000000000').replace(/def:slow-speed@/, 'def:gone@'));
  assert.equal(drift[0].status, 'missing'); assert.deepEqual(drift[0].links.map((l) => l.status), ['changed', 'missing']);
  const { test: t, errors } = await parseTest(source); assert.deepEqual(errors, []); assert.equal(t.settings.openBook, true); assert.equal(t.items[0].cror.length, 2);
  const pub = publicItem(t.items[0]); assert.equal(pub.cror, undefined); assert.equal(pub.ref, undefined); assert.equal(pub.key, undefined);
  assert.equal(linkSource(ix, source).source, source, 'linking twice is idempotent');
});
