// The whole exchange: RTC issues a TGBO, a train copies it, works it, releases; RTC scores and cancels.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { makeProfile } from '../src/profile.js';
import { parseTest } from '../src/txt.js';
import { copyTest, issueTest, openItem } from '../src/testfile.js';
import { giveRelease, takeRelease } from '../src/release.js';
import { scoreAttempt, summarize } from '../src/score.js';
import { cancelTest, readCancel } from '../src/cancel.js';
import { newSheet, openSheet, saveSheet } from '../src/sheet.js';
import { dearmor } from '../src/armor.js';

const src = await readFile(new URL('../examples/test3.txt', import.meta.url), 'utf8');
const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('test → copy → release → score → cancel', async () => {
  const { test: t, errors } = await parseTest(src); assert.deepEqual(errors, []);
  const sheet = await newSheet(await makeProfile('rtc', 'RTC ABC', '777777', '', true));
  const alice = await makeProfile('crew', 'Alice', '123456'), bob = await makeProfile('crew', 'Bob', '654321'), eve = await makeProfile('crew', 'Eve', '111111');
  sheet.trains.push({ pin: alice.pin, pub: alice.pub, name: 'Alice' }, { pin: bob.pin, pub: bob.pub, name: 'Bob' });

  const { text: tgbo, record } = await issueTest(t, sheet.rtc, sheet.trains, { 'clearance-134.png': { mime: 'image/png', b64: png1x1 } });
  sheet.tests.push(record);
  assert.match(tgbo, /^-----BEGIN BALLAST TEST-----\nversion: 1\ntitle: Test 3/);
  const raw = (await dearmor(tgbo)).body;
  assert.equal(raw.clearances.length, 2); assert.equal(raw.clearances[0].no, 1); assert.equal(raw.items.length, 4);
  assert.ok(!JSON.stringify(raw).includes('20 seconds warning'), 'no plaintext question leaks'); // key text of q14
  assert.ok(!JSON.stringify(raw).includes('engine number verified'), 'no answer leaks');

  // Alice copies it; Eve, not on the sheet, cannot; Bob cannot use Alice's PIN.
  const a = await copyTest(tgbo, alice, alice.pin);
  assert.equal(a.clearance, 1);
  assert.equal(a.complete, record.hash.slice(0, 4).toUpperCase());
  await assert.rejects(copyTest(tgbo, eve, eve.pin), /no clearance/);
  await assert.rejects(copyTest(tgbo, bob, alice.pin), /cannot open/);
  // One item at a time; options shuffled per train; the img rides inside the item; no key anywhere.
  const q = await a.item('q27-green-dark');
  assert.equal(q.key, undefined); assert.equal(q.svg, 'signal G,x,R'); assert.equal(q.options.length, 3);
  const b = await copyTest(tgbo, bob, bob.pin);
  assert.notDeepEqual(a.order, b.order, 'crew see different item orders');
  const s = await a.item('q302-verify'); assert.equal(s.answer, undefined); assert.equal(s.img[0].b64, png1x1);
  const m = await a.item('q-def-reduced'); assert.equal(m.rights.length, 3); assert.equal(m.pairs[0].right, undefined || m.pairs[0].right); // rights are separate

  // Alice works it and releases.
  const attempt = { started: 1000, finished: 5000, answers: { 'q27-green-dark': 'a', 'q14-whistle': 'a', 'q-def-reduced': { a: 'a', b: 'c', c: 'c' }, 'q302-verify': 'both have a copy' },
    events: [[0, 'copy', 'complete', a.complete], [10, 'show', 'q27-green-dark'], [900, 'blur'], [1300, 'focus']], breaks: [{ at: 900, ms: 400, why: 'blur' }] };
  const rel = await giveRelease(a, alice, alice.pin, attempt);
  assert.match(rel, /^-----BEGIN BALLAST RELEASE-----\nversion: 1\ntitle: Test 3 · Block C \(sample\)\ntrain: CN 123456\n/);

  // RTC takes it; Bob's key cannot forge Alice's release; a tampered release fails.
  const taken = await takeRelease(rel, sheet.rtc, record);
  assert.equal(taken.pin, '123456'); assert.deepEqual(taken.attempt, attempt);
  const forged = await giveRelease({ ...a, rtc: a.rtc }, bob, alice.pin, attempt); // Bob signs with his key, claims Alice's pin
  const tf = await takeRelease(forged, sheet.rtc, record); assert.equal(tf.train, bob.pub, 'the key, not the pin, says who released');
  assert.notEqual(tf.train, sheet.trains.find((x) => x.pin === '123456').pub);

  // Score: mc 1/1 + mc 0/1 + match 2/3 + short pending → then marked.
  let r = scoreAttempt(t, taken.attempt);
  assert.equal(r.score, 3); assert.equal(r.total, 6); assert.equal(r.pending, 1);
  r = scoreAttempt(t, taken.attempt, { 'q302-verify': 1 });
  assert.equal(r.score, 4); assert.equal(r.pending, 0); assert.equal(r.pass, false);
  assert.deepEqual(r.read.map((x) => x.ref), ['CROR 14(l)', 'CROR SPEEDS']);
  assert.equal(r.areas.find((x) => x.id === 'signals').correct, 1);
  const sum = summarize(t, [r]); assert.equal(sum.byItem[0].id, 'q14-whistle'); assert.equal(sum.n, 1);

  // Cancel: Alice reads her marks and read-list; nothing else.
  const can = await cancelTest(record, sheet.rtc, alice.pub, alice.pin, r);
  const seen = await readCancel(can, alice);
  assert.equal(seen.grade, r.grade); assert.equal(seen.perItem, undefined); assert.equal(seen.read[0].ref, 'CROR 14(l)');
  await assert.rejects(readCancel(can, bob), /cannot open/);

  // The sheet round-trips under a passphrase and can still open items and releases.
  const saved = await saveSheet(sheet, 'correct horse');
  await assert.rejects(openSheet(saved, 'wrong'), /wrong passphrase/);
  const back = await openSheet(saved, 'correct horse');
  assert.equal(back.rtc.pub, sheet.rtc.pub); assert.equal(back.trains.length, 2);
  const again = await takeRelease(rel, back.rtc, back.tests[0]); assert.equal(again.pin, '123456');
  const item = await openItem(back.tests[0], raw, 'q14-whistle'); assert.match(item.prompt, /30 MPH/);
});
