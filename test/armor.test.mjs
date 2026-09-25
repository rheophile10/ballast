import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armor, dearmor, sniff } from '../src/armor.js';

test('armor round-trips and survives being pasted into an email', async () => {
  const body = { v: 1, kind: 'release', hello: 'wörld', n: [1, 2, 3] };
  const a = await armor('RELEASE', body, { test: 'Test 3', items: 95 });
  assert.match(a, /^-----BEGIN BALLAST RELEASE-----\nversion: 1\ntest: Test 3\nitems: 95\nsha256: [0-9a-f]{64}\n\n/);
  const mail = 'Hi,\n\nhere is my test\n\n' + a.replace(/\n/g, '\r\n') + '\r\n-- Ian';
  const { kind, headers, body: b } = await dearmor(mail);
  assert.equal(kind, 'RELEASE'); assert.equal(headers.items, '95'); assert.deepEqual(b, body);
  assert.equal(sniff(mail), 'RELEASE');
  const lines = a.split('\n'); const bi = lines.findIndex((l, i) => i > 0 && lines[i - 1] === '');
  lines[bi] = lines[bi].slice(0, 4) === 'AAAA' ? 'BBBB' + lines[bi].slice(4) : 'AAAA' + lines[bi].slice(4);
  await assert.rejects(dearmor(lines.join('\n')), /sha256 mismatch|cannot|not a Ballast/);
  await assert.rejects(dearmor(a, 'TEST'), /expected a TEST/);
});
