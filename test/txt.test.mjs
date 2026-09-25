import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseTest, publicItem } from '../src/txt.js';

test('parses the sample test', async () => {
  const { test: t, errors } = await parseTest(await readFile(new URL('../samples/test3-block-c.txt', import.meta.url), 'utf8'));
  assert.deepEqual(errors, []);
  assert.equal(t.title, 'Test 3 · Block C (sample)');
  assert.equal(t.settings.time, 5400);
  assert.equal(t.settings.pass, 0.9);
  assert.equal(t.areas.length, 4);
  assert.equal(t.items.length, 4);
  const mc = t.items.find((i) => i.id === 'q27-green-dark');
  assert.equal(mc.key, 'a'); assert.equal(mc.options.length, 3); assert.deepEqual(mc.ref, ['CROR 27(b)']);
  assert.equal(mc.svg, 'signal G,x,R'); assert.deepEqual(mc.tags, ['imperfect-display', 'difficulty:2']);
  const match = t.items[0]; assert.equal(match.type, 'match'); assert.equal(match.worth, 3);
  assert.equal(publicItem(mc).key, undefined); assert.equal(publicItem(t.items[3]).answer, undefined);
});

test('reports errors instead of guessing', async () => {
  const { errors } = await parseTest('# T\nareas: a "A"\n---\ntype: mc\narea: zzz\nQ: hi\na) x\nb) y\n---\ntype: short\nQ: no answer\n');
  assert.ok(errors.some((e) => /no \* key/.test(e)));
  assert.ok(errors.some((e) => /area "zzz"/.test(e)));
  assert.ok(errors.some((e) => /no A:/.test(e)));
});
