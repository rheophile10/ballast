// Provenance: windows bind the clearance key, releases are signed and carry an audit copy, cancellations are signed
// and name the release they mark, and the superintendent can re-score a release without the RTC's sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseTest } from '../src/txt.js';
import { makeProfile, mintProfile } from '../src/profile.js';
import { newSheet } from '../src/sheet.js';
import { copyTest, issueTest, defaultWindow } from '../src/testfile.js';
import { giveRelease, takeRelease, auditRelease } from '../src/release.js';
import { cancelTest, readCancel } from '../src/cancel.js';
import { scoreAttempt } from '../src/score.js';
import { approveSource, readApproval } from '../src/director.js';
import { armor, dearmor } from '../src/armor.js';

const src = await readFile(new URL('../samples/test3-block-c.txt', import.meta.url), 'utf8');
const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const assets = { 'clearance-134.png': { mime: 'image/png', b64: png1x1 } };

const setup = async () => {
  const { test: t } = await parseTest(src);
  const sup = await makeProfile('superintendent', 'Sup', '900000', '', true);
  const rtc = await makeProfile('rtc', 'RTC', '777777', '', true);
  const alice = await makeProfile('crew', 'Alice', '123456', '', true);
  const sheet = await newSheet(rtc); sheet.trains.push({ pin: alice.pin, pub: alice.pub, sig: alice.sig, name: 'Alice' });
  const approval = await readApproval(await approveSource(sup, src, t.title));
  return { t, sup, rtc, alice, sheet, approval };
};
const answerAll = async (copy) => { const answers = {}; for (const id of copy.order) { const it = await copy.item(id); answers[id] = it.type === 'mc' ? it.options[0].id : it.type === 'match' ? Object.fromEntries(it.pairs.map((p, i) => [p.id, it.rights[i].id])) : 'because'; } return { started: 1, finished: Date.now(), answers, events: [], breaks: [] }; };

test('the window is enforced and bound into the clearance key', async () => {
  const { t, rtc, alice, sheet } = await setup();
  const w = { from: new Date(Date.now() + 3600e3).toISOString(), until: new Date(Date.now() + 7200e3).toISOString() };
  const { text } = await issueTest(t, rtc, sheet.trains, assets, 'RTC', null, w);
  await assert.rejects(copyTest(text, alice, alice.pin), /opens at/);
  await assert.rejects(copyTest(text, alice, alice.pin, Date.parse(w.until) + 1), /closed at/);
  const copy = await copyTest(text, alice, alice.pin, Date.parse(w.from) + 1); assert.equal(copy.window.from, w.from);
  // widen the window in the file: the sha256 header is recomputed by re-armoring, but the key no longer derives
  const { body } = await dearmor(text); const opened = await armor('TEST', { ...body, window: { ...w, from: new Date().toISOString() } });
  await assert.rejects(copyTest(opened, alice, alice.pin), /wrong key or tampered/);
  await assert.rejects(issueTest(t, rtc, sheet.trains, assets, 'RTC', null, { from: w.until, until: w.from }), /closes before/);
  assert.ok(defaultWindow().until > defaultWindow().from);
});

test('release is signed by the crew member and names the approved source; cancellation is signed and names the release', async () => {
  const { t, rtc, alice, sheet, approval } = await setup();
  const { text, record } = await issueTest(t, rtc, sheet.trains, assets, 'RTC', approval);
  const copy = await copyTest(text, alice, alice.pin); const attempt = await answerAll(copy);
  const rel = await giveRelease(copy, alice, alice.pin, attempt);
  const { headers, body } = await dearmor(rel, 'RELEASE');
  assert.equal(body.source, approval.hash); assert.ok(body.audit && body.audit.pub === approval.pub); assert.equal(body.sig, alice.sig);
  const taken = await takeRelease(rel, rtc, record, alice.sig);
  assert.equal(taken.signed, true); assert.equal(taken.hash, headers.sha256); assert.equal(taken.late, false);
  // a release whose sealed attempt was swapped fails the signature (and GCM) — try just the signature: alter the box in place
  const tampered = await armor('RELEASE', { ...body, signature: body.signature.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) });
  assert.equal((await takeRelease(tampered, rtc, record, alice.sig)).signed, false);
  // score and cancel, naming the release hash and the answers as marked
  const s = scoreAttempt(t, taken.attempt, {});
  const can = await cancelTest(record, rtc, alice.pub, alice.pin, s, { hash: taken.hash, answers: taken.attempt.answers });
  const marks = await readCancel(can, alice);
  assert.equal(marks.release, headers.sha256); assert.equal(marks.signed, true); assert.equal(marks.by, rtc.sig);
  assert.deepEqual(marks.answers, attempt.answers); assert.equal(marks.items.length, t.items.length); assert.equal(marks.grade, s.grade);
  assert.ok(!JSON.stringify(marks).includes('engine number verified'), 'no key leaks in the cancellation');
  // an RTC who edits the grade after signing is caught
  const cb = (await dearmor(can)).body; const forged = await armor('CANCEL', { ...cb, release: 'deadbeef' });
  assert.equal((await readCancel(forged, alice)).signed, false);
});

test('the superintendent re-scores a release from the audit copy and the approved source, without the sheet', async () => {
  const { t, sup, rtc, alice, sheet, approval } = await setup();
  const { text, record } = await issueTest(t, rtc, sheet.trains, assets, 'RTC', approval);
  const copy = await copyTest(text, alice, alice.pin); const attempt = await answerAll(copy);
  const rel = await giveRelease(copy, alice, alice.pin, attempt);
  const rtcSide = scoreAttempt(t, (await takeRelease(rel, rtc, record)).attempt, {});
  const audit = await auditRelease(rel, sup);
  assert.equal(audit.pin, alice.pin); assert.equal(audit.source, approval.hash); assert.equal(audit.signed, true);
  const supSide = scoreAttempt(t, audit.attempt, {});
  assert.equal(supSide.score, rtcSide.score); assert.deepEqual(supSide.perItem.map((i) => i.got), rtcSide.perItem.map((i) => i.got));
  const other = await makeProfile('superintendent', 'Other', '900001', '', true);
  await assert.rejects(auditRelease(rel, other), /different superintendent/);
  // unapproved test: no audit copy
  const plain = await issueTest(t, rtc, sheet.trains, assets, 'RTC', null);
  const rel2 = await giveRelease(await copyTest(plain.text, alice, alice.pin), alice, alice.pin, attempt);
  await assert.rejects(auditRelease(rel2, sup), /no audit copy/);
});

test('a bundle is blocks concatenated; each side finds its own', async () => {
  const { blocks, bundle } = await import('../src/armor.js');
  const { t, rtc, alice, sheet, approval } = await setup();
  const bob = await makeProfile('crew', 'Bob', '654321', '', true); sheet.trains.push({ pin: bob.pin, pub: bob.pub, sig: bob.sig, name: 'Bob' });
  const { text, record } = await issueTest(t, rtc, sheet.trains, assets, 'RTC', approval);
  const rels = []; for (const c of [alice, bob]) { const copy = await copyTest(text, c, c.pin); rels.push(await giveRelease(copy, c, c.pin, await answerAll(copy))); }
  const b = bundle(rels); assert.equal(blocks(b).length, 2); assert.equal(blocks('hello\n' + b + '\nbye').length, 2);
  const taken = []; for (const blk of blocks(b)) taken.push(await takeRelease(blk, rtc, record));
  assert.deepEqual(taken.map((x) => x.pin).sort(), ['123456', '654321']);
  const cans = []; for (const tk of taken) cans.push(await cancelTest(record, rtc, tk.train, tk.pin, scoreAttempt(t, tk.attempt, {}), { hash: tk.hash, answers: tk.attempt.answers }));
  const cb = bundle(cans); const mine = blocks(cb).find((x) => /^train: Crew 654321$/m.test(x)); assert.ok(mine);
  assert.equal((await readCancel(mine, bob)).pin, '654321'); await assert.rejects(readCancel(mine, alice));
});

test('the chain: a crew mint carries the superintendent; crew refuse tests not approved by that superintendent; a swapped item is caught', async () => {
  const { t } = await setup();
  const sup0 = await makeProfile('superintendent', 'Root', '900100', '', true); const sup = { ...sup0, ...(await mintProfile(sup0, sup0, 'superintendent')) };
  const rtc0 = await makeProfile('none', 'Teacher', '710100', '', true); const rtc = { ...rtc0, ...(await mintProfile(sup, rtc0, 'rtc')) };
  const c0 = await makeProfile('none', 'Carol', '123499', '', true); const carol = { ...c0, ...(await mintProfile(rtc, c0, 'crew')) };
  const { checkMint } = await import('../src/profile.js');
  assert.equal(carol.minted.root.sig, sup.sig); assert.equal(carol.minted.via.by.sig, sup.sig); assert.equal(await checkMint(carol), true);
  const other = await makeProfile('superintendent', 'Other', '900101', '', true);
  assert.equal(await checkMint({ ...carol, minted: { ...carol.minted, root: { name: 'Other', sig: other.sig, pub: other.pub } } }), false, 'the root is under the signature');
  assert.equal(await checkMint({ ...carol, minted: { ...carol.minted, via: null } }), false, 'an RTC mint must show its own mint');
  const roster = [{ pin: carol.pin, pub: carol.pub, sig: carol.sig, name: 'Carol' }]; const trust = { root: carol.minted.root.sig };
  // unapproved: refused
  const plain = await issueTest(t, rtc, roster, assets, 'RTC', null);
  await assert.rejects(copyTest(plain.text, carol, carol.pin, Date.now(), trust), /no superintendent approval/);
  // approved by a stranger: refused
  const otherMinted = { ...other, ...(await mintProfile(other, other, 'superintendent')) };
  const strangers = await readApproval(await approveSource(otherMinted, src, t.title));
  await assert.rejects(copyTest((await issueTest(t, rtc, roster, assets, 'RTC', strangers)).text, carol, carol.pin, Date.now(), trust), /not by the superintendent/);
  // approved by the root: every item opens and hashes to the approval
  const approval = await readApproval(await approveSource(sup, src, t.title)); assert.equal(approval.v, 2); assert.equal(Object.keys(approval.items).length, t.items.length);
  const good = await issueTest(t, rtc, roster, assets, 'RTC', approval); const copy = await copyTest(good.text, carol, carol.pin, Date.now(), trust);
  for (const id of copy.order) assert.ok((await copy.item(id)).prompt);
  // the RTC swaps an item for their own: the approval names a different hash, the crew's copy stops
  const t2 = { ...t, items: t.items.map((it, i) => (i === 0 ? { ...it, prompt: it.prompt + ' (edited by the RTC)' } : it)) };
  const bad = await issueTest(t2, rtc, roster, assets, 'RTC', approval); const copy2 = await copyTest(bad.text, carol, carol.pin, Date.now(), trust);
  await assert.rejects(copy2.item(t.items[0].id), /not what the superintendent approved/);
  assert.ok((await copy2.item(t.items[1].id)).prompt, 'untouched items still open');
});
