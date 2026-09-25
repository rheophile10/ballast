import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fold, toRelease } from '../src/app/attempt.js';

test('the attempt is a fold over events; playback is a prefix', () => {
  const ev = [[0, 'copy', '6E2F'], [10, 'show', 'a'], [50, 'answer', 'a', 'b'], [60, 'show', 'b'], [70, 'break', 'blur'], [900, 'resume'], [950, 'answer', 'b', 'c'], [1000, 'submit']];
  const s = fold(['a', 'b'], ev);
  assert.equal(s.started, 0); assert.equal(s.finished, 1000); assert.deepEqual(s.answers, { a: 'b', b: 'c' });
  assert.deepEqual(s.breaks, [{ at: 70, ms: 830, why: 'blur' }]); assert.equal(s.open, null);
  const mid = fold(['a', 'b'], ev.slice(0, 5)); assert.equal(mid.at, 1); assert.equal(mid.open.why, 'blur'); assert.deepEqual(mid.answers, { a: 'b' });
  const r = toRelease(['a', 'b'], ev); assert.equal(r.finished, 1000); assert.equal(r.events.length, 8);
});
