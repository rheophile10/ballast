import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { index, search, resolve, linkify, h12, checkLink, linkFor, checkDocument } from '../src/reader/doc.js';
import { makeNote, segments, exportNotes, importNotes, merge, anchor } from '../src/reader/notes.js';

const doc = JSON.parse(await readFile(new URL('../documents/cror-2025.json', import.meta.url), 'utf8'));
const ix = index(checkDocument(doc));

test('the CROR 2025 document indexes: sections, rules, sub-rules, signals; hashes agree with the extractor', async () => {
  assert.ok(ix.roots.length >= 15); assert.equal(ix.get('27').title, 'Signal Imperfectly Displayed');
  assert.equal(ix.get('27(b)').parent, '27'); assert.equal(ix.get('405').kind, 'signal'); assert.match(ix.get('439').text, /^Stop - Stop/);
  assert.equal(await h12(ix.get('103(g)').text), ix.get('103(g)').hash);
  assert.deepEqual(ix.path('104(i)').map((n) => n.id), ['sec:operation-of-movements', '104', '104(i)'].slice(-3));
});
test('references resolve to the deepest node that exists, and text is linkified', () => {
  assert.equal(resolve(ix, 'CROR 27(b)'), '27(b)'); assert.equal(resolve(ix, 'Rule 103(g)'), '103(g)'); assert.equal(resolve(ix, '27(z)'), '27');
  assert.equal(resolve(ix, '(b)', '27(a)'), '27(b)'); assert.equal(resolve(ix, 'GOI 8.1'), null);
  const segs = linkify(ix, 'until all affected movements are instructed to apply Rule 103(g). See Rules 405-440 and paragraph (b).', '27(a)');
  const links = segs.filter((s) => s.link).map((s) => s.id); assert.deepEqual(links, ['103(g)', '405', '440', '27(b)']);
  assert.equal(segs.map((s) => s.text).join(''), 'until all affected movements are instructed to apply Rule 103(g). See Rules 405-440 and paragraph (b).');
});
test('search finds headings and text, headings first', () => {
  const r = search(ix, 'imperfectly displayed'); assert.equal(r[0].id, '27'); assert.ok(r[0].inTitle);
  const s = search(ix, 'clear to limited'); assert.equal(s[0].id, '406');
  assert.ok(search(ix, 'hand brake').length > 3); assert.deepEqual(search(ix, 'x'), []);
});
test('item links carry a hash; a changed or missing rule is reported', () => {
  const l = linkFor(ix, 'CROR 27(b)'); assert.match(l, /^27\(b\)@[0-9a-f]{12}$/);
  assert.equal(checkLink(ix, l).status, 'ok'); assert.equal(checkLink(ix, '27(b)@000000000000').status, 'changed'); assert.equal(checkLink(ix, '999@abc').status, 'missing');
  assert.equal(linkFor(ix, 'GOI 8.1'), null);
});
test('notes anchor by quote, survive text drift, split into segments, round-trip and merge', () => {
  const t = ix.get('27(b)').text; const q = t.slice(10, 30);
  const n = makeNote('27(b)', 10, 30, q, 'remember this'); const m = makeNote('27(b)', 20, 40, t.slice(20, 40), 'and this');
  const segs = segments(t, [n, m]); assert.equal(segs.map((s) => t.slice(s.start, s.end)).join(''), t);
  assert.deepEqual(segs.find((s) => s.start === 20).notes.map((x) => x.text), ['remember this', 'and this']);
  assert.deepEqual(anchor('xx' + t, n), [12, 32]); assert.equal(anchor('nothing here', n), null);
  const j = importNotes(exportNotes('cror-2025', '2025', [n])); assert.equal(j.notes[0].text, 'remember this');
  const merged = merge([n], [{ ...n, text: 'edited', at: n.at + 1 }, m]); assert.equal(merged.find((x) => x.id === n.id).text, 'edited'); assert.equal(merged.length, 2);
});
test('definitions are nodes and can be cited by name; lettered signals keep their letters', () => {
  assert.equal(ix.get('def:slow-speed').kind, 'definition'); assert.match(ix.get('def:slow-speed').text, /15 miles per hour/i);
  assert.equal(resolve(ix, 'CROR Slow Speed'), 'def:slow-speed'); assert.equal(resolve(ix, 'def:restricted-speed'), 'def:restricted-speed');
  assert.equal(ix.get('432A').kind, 'signal'); assert.equal(ix.get('432').title, 'Slow to Limited'); assert.ok(search(ix, 'limited speed').length);
});
