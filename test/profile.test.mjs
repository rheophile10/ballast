import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeProfile, profileText, readProfile, signBytes, verifyBytes } from '../src/profile.js';
import { approveSource, checkApproval, readApproval, sendReport, takeReport } from '../src/director.js';
import { newBook, openBook, saveBook } from '../src/sheet.js';
import { utf8 } from '../src/bytes.js';
import { parseTest } from '../src/txt.js';

test('profiles travel as text with the photo inside; signatures verify', async () => {
  const s = await makeProfile('none', 'Alice', '123456', '/9j/fakejpeg');
  const t = await profileText(s); assert.match(t, /BEGIN BALLAST PROFILE/);
  const p = await readProfile(t); assert.equal(p.role, 'none'); assert.equal(p.photo, '/9j/fakejpeg'); assert.equal(p.pub, s.pub);
  const sig = await signBytes(s.sign, utf8('hello')); assert.ok(await verifyBytes(s.sig, sig, utf8('hello'))); assert.ok(!(await verifyBytes(s.sig, sig, utf8('hellp'))));
  await assert.rejects(makeProfile('crew', 'x', '12'), /PIN/);
});

test('director approves a source and reads a report; book round-trips', async () => {
  const d = await makeProfile('superintendent', 'Dir', '999999', '', true), tch = await makeProfile('rtc', 'Tch', '888888', '', true);
  const src = '# T\n---\ntype: mc\nQ: q\n*a) y\nb) n\n';
  const ap = await readApproval(await approveSource(d, src, 'T'));
  assert.ok(await checkApproval(ap, src)); assert.ok(!(await checkApproval(ap, src + ' ')));
  const rep = { test: 'AAAAAAAAAAAAAAAAAAAAAA', title: 'T', rows: [{ pin: '1', grade: 0.9 }] };
  const rt = await sendReport(tch, d.pub, rep);
  const got = await takeReport(rt, d); assert.deepEqual(got.report, rep); assert.equal(got.teacher, tch.pub);
  const book = await newBook(d); book.reports.push(got);
  const back = await openBook(await saveBook(book, 'pw'), 'pw'); assert.equal(back.rtc.name, 'Dir'); assert.equal(back.reports.length, 1);
  assert.ok(await checkApproval(await readApproval(await approveSource(back.rtc, src, 'T')), src), 'the reopened book can still sign');
});

