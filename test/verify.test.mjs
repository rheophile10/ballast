// verify.py (Python, cryptography) must open and score what src/ (JS, WebCrypto) produced, and agree to the number.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { makeProfile } from '../src/profile.js';
import { parseTest } from '../src/txt.js';
import { copyTGBO, issueTGBO } from '../src/tgbo.js';
import { giveRelease } from '../src/release.js';
import { scoreAttempt } from '../src/score.js';
import { newSheet, saveSheet } from '../src/sheet.js';

test('verify.py agrees with src/ on a real release', async () => {
  const src = readFileSync(new URL('../examples/test3.txt', import.meta.url), 'utf8');
  const { test: t } = await parseTest(src);
  const sheet = await newSheet(await makeProfile('rtc', 'RTC ABC', '777777', '', true));
  const train = await makeProfile('crew', 'Alice', '123456');
  sheet.trains.push({ pin: train.pin, pub: train.pub, name: 'Alice' });
  const { text: tgbo, record } = await issueTGBO(t, sheet.rtc, sheet.trains, { 'clearance-134.png': { mime: 'image/png', b64: 'AA==' } });
  sheet.tgbos.push(record);
  const copy = await copyTGBO(tgbo, train, train.pin);
  const attempt = { started: 1, finished: 2, answers: { 'q27-green-dark': 'a', 'q14-whistle': 'c', 'q-def-reduced': { a: 'a', b: 'b', c: 'a' }, 'q302-verify': 'x' }, events: [], breaks: [{ at: 5000, ms: 900, why: 'fullscreen-exit' }] };
  const rel = await giveRelease(copy, train, train.pin, attempt);
  const dir = mkdtempSync(join(tmpdir(), 'ballast-'));
  writeFileSync(join(dir, 'sheet.bed'), await saveSheet(sheet, 'pw'));
  writeFileSync(join(dir, 'test3.txt'), src);
  writeFileSync(join(dir, 'alice.spike'), rel);
  writeFileSync(join(dir, 'marks.json'), JSON.stringify({ 'q302-verify': 1 }));
  const js = scoreAttempt(t, attempt, { 'q302-verify': 1 });
  const out = execFileSync('python3', [new URL('../verify.py', import.meta.url).pathname, join(dir, 'sheet.bed'), join(dir, 'test3.txt'), join(dir, 'alice.spike'), '--pass', 'pw', '--marks', join(dir, 'marks.json'), '--json'], { encoding: 'utf8' });
  const py = JSON.parse(out);
  assert.equal(py.score, js.score); assert.equal(py.total, js.total); assert.equal(py.pass, js.pass); assert.equal(py.pending, 0);
  assert.deepEqual(py.read.map((x) => x[0]), js.read.map((x) => x.ref));
  for (const a of js.areas) if (a.total) assert.deepEqual(py.areas[a.id], { correct: a.correct, total: a.total });
  const human = execFileSync('python3', [new URL('../verify.py', import.meta.url).pathname, join(dir, 'sheet.bed'), join(dir, 'test3.txt'), join(dir, 'alice.spike'), '--pass', 'pw'], { encoding: 'utf8' });
  assert.match(human, /train key matches the sheet/); assert.match(human, /1 break/);
});
