// Make the fictional cast for the tutorial: keys, minted profiles, and appraisal text. Everything is real and signed.
// Output: samples/cast.json (with private keys — a demo cast, not people). Run: node samples/make.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { makeProfile, mintProfile, exportKeys, publicProfile } from '../src/profile.js';

const sup0 = await makeProfile('superintendent', 'Marguerite Boudreau', '900011', '', true);
const sup = { ...sup0, ...(await mintProfile(sup0, sup0, 'superintendent', '2024-03-01')) };
const rtcSpec = [
  ['Denise Okafor', '710021', '2024-09-03', 'fair'],
  ['Ray Kowalczyk', '710034', '2023-01-16', 'nose'],
  ['Tom Ferland', '710047', '2025-04-22', 'lazy'],
];
const rtcs = [];
for (const [name, pin, start, style] of rtcSpec) { const p = await makeProfile('none', name, pin, '', true); rtcs.push({ ...p, ...(await mintProfile(sup, p, 'rtc', start)), style }); }
const crewSpec = [
  ['Alice Marchand', '123456', 0, 0.94], ['Ben Okoye', '123457', 0, 0.88], ['Chloe Tremblay', '123458', 0, 0.97], ['Darius Hall', '123459', 0, 0.71],
  ['Emma Sinclair', '123460', 1, 0.92], ['Gordon Whitfield', '123461', 1, 0.83], ['Grace Whitecloud', '123462', 1, 0.95], ['Hugo Lavoie', '123463', 1, 0.66],
  ['Isla McKay', '123464', 2, 0.90], ['Jonas Berg', '123465', 2, 0.79], ['Kira Nowak', '123466', 2, 0.93], ['Liam Desjardins', '123467', 2, 0.58],
];
const crew = [];
for (const [name, pin, r, skill] of crewSpec) { const p = await makeProfile('none', name, pin, '', true); crew.push({ ...p, ...(await mintProfile(rtcs[r], p, 'crew', '2026-06-09')), rtc: r, skill }); }
// appraisals: one fair RTC, one who grades faces and jokes, one who barely writes anything
const notes = {
  fair: { 123456: [4, 'Steady on the point, calls every signal by name without prompting. Weak on 27 exceptions — assigned reading.'], 123457: [3, 'Solid rule knowledge, slow on the radio. Improving.'], 123458: [5, 'Best in the class. Reads ahead, asks the right questions, helps others without being asked.'], 123459: [2, 'Struggles with authorities; missed two 564 questions twice. Needs a second pass at Block B material before qualifying.'] },
  nose: { 123460: [5, 'Great kid, funniest person in the room, keeps everyone loose.'], 123461: [2, 'Has an ugly nose and I have to look at it all day. Not a railroader.'], 123462: [5, 'Very sharp. Laughs at my jokes.'], 123463: [1, 'Sits at the back. Weird. Did not laugh once all block. Would not hire.'] },
  lazy: { 123464: [3, 'ok'], 123465: [3, 'ok'], 123466: [3, 'fine'], 123467: [3, ''] },
};
const dump = async (p) => ({ ...publicProfile(p), keys: await exportKeys(p) });
const cast = { superintendent: await dump(sup), rtcs: await Promise.all(rtcs.map(async (r) => ({ ...(await dump(r)), style: r.style }))), crew: await Promise.all(crew.map(async (c) => ({ ...(await dump(c)), rtc: c.rtc, skill: c.skill, rating: notes[rtcs[c.rtc].style][c.pin][0], note: notes[rtcs[c.rtc].style][c.pin][1] }))),
  tests: ['test1-definitions-signals.txt', 'test2-crossings-switches.txt', 'test3-block-c.txt'].map((f) => ({ name: f, source: readFileSync(new URL('./' + f, import.meta.url), 'utf8') })) };
writeFileSync(new URL('./cast.json', import.meta.url), JSON.stringify(cast, null, 1));
console.log(`cast: 1 superintendent, ${rtcs.length} RTCs, ${crew.length} crew, ${cast.tests.length} tests`);

// ---------- sample files: one of everything that moves, as armored text, under samples/files/
import { mkdirSync } from 'node:fs';
import { profileText, registration } from '../src/profile.js';
import { parseTest } from '../src/txt.js';
import { issueTest, copyTest } from '../src/testfile.js';
import { giveRelease, takeRelease } from '../src/release.js';
import { cancelTest } from '../src/cancel.js';
import { approveSource, readApproval, sendReport } from '../src/director.js';
import { scoreAttempt, summarize } from '../src/score.js';
import { saveSheet, newSheet } from '../src/sheet.js';
const dir = new URL('./files/', import.meta.url); mkdirSync(dir, { recursive: true });
const put = (name, text) => writeFileSync(new URL(name, dir), text);
const { test: t1 } = await parseTest(cast.tests[0].source);
const alice = crew[0], denise = rtcs[0];
put('registration-Alice-Marchand.txt', await profileText(registration(alice)));
put('profile-crew-Alice-Marchand.txt', await profileText(alice));
put('profile-RTC-Denise-Okafor.txt', await profileText(denise));
put('profile-superintendent-Marguerite-Boudreau.txt', await profileText(sup));
const approvalText = await approveSource(sup, cast.tests[0].source, t1.title); put('approval-Test-1.txt', approvalText);
const approval = await readApproval(approvalText);
const window = { from: '2026-09-01T13:00:00.000Z', until: '2026-09-08T13:00:00.000Z' };
const group = crew.filter((c) => c.rtc === 0);
const { text: testText, record } = await issueTest(t1, denise, group, {}, 'OKA', approval, window);
put('Test-1.test.txt', testText);
const copy = await copyTest(testText, alice, alice.pin, Date.parse(window.from) + 3600e3);
const answers = {}; for (const id of copy.order) { const it = await copy.item(id); answers[id] = it.type === 'mc' ? it.options[0].id : it.type === 'match' ? Object.fromEntries(it.pairs.map((p, i) => [p.id, it.rights[i].id])) : 'both crew members verify their copy, the designation and the engine number'; }
const t0 = Date.parse(window.from) + 3600e3;
const releaseText = await giveRelease(copy, alice, alice.pin, { started: t0, finished: t0 + 900e3, answers, events: [[t0, 'copy', copy.complete], ...copy.order.map((id, i) => [t0 + 60e3 * (i + 1), 'show', id]), [t0 + 900e3, 'submit', 'done']], breaks: [], ua: 'sample' });
put('release-Alice-Marchand.txt', releaseText);
const taken = await takeRelease(releaseText, denise, record, alice.sig);
const s = scoreAttempt(t1, taken.attempt, Object.fromEntries(t1.items.filter((it) => it.type === 'short').map((it) => [it.id, 1])));
put('cancel-CN123456.txt', await cancelTest(record, denise, alice.pub, alice.pin, s, { hash: taken.hash, answers: taken.attempt.answers }));
const sum = summarize(t1, [s]);
put('class-profile-Test-1-Okafor.txt', await sendReport(denise, sup.pub, { test: record.id, title: t1.title, hash: record.hash, window, approved: true, rtc: { name: denise.name, pin: denise.pin }, class: 'Block A · Okafor', issued: Date.parse(window.from), sent: Date.parse(window.until), pass: t1.settings.pass, n: 1, passed: sum.passed, mean: sum.mean, byArea: sum.byArea.map((a) => ({ id: a.id, label: a.label, mean: a.mean })), hardest: [],
  rows: [{ pin: alice.pin, name: alice.name, score: s.score, total: s.total, grade: s.grade, pass: s.pass, pending: 0, breaks: 0, identity: 'ok', release: taken.hash, signed: taken.signed, late: taken.late, marks: s.perItem.map((i) => [i.id, i.got]), areas: s.areas.map((a) => ({ id: a.id, label: a.label, correct: a.correct, total: a.total })), strengths: [], weaknesses: [], read: s.read, rating: 4, note: 'Steady on the point.' }] }));
const sheet = await newSheet(denise); sheet.trains.push(...group.map((c) => publicProfile(c))); sheet.tests.push({ ...record, source: cast.tests[0].source, text: testText, issued: Date.parse(window.from), trains: group.map((c) => c.pin), approved: true, class: 'Block A · Okafor' });
put('sheet-Denise-Okafor.txt', await saveSheet(sheet, 'sample'));
console.log('samples/files/: registration, profiles, approval, test, release, cancel, class profile, sheet (passphrase "sample")');
