// The fictional cast, alive at runtime: they mint you, send registrations, issue tests, release attempts, file class profiles.
import cast from '../../samples/cast.json';
import { importKeys, mintProfile, profileText, registration } from '../../src/profile.js';
import { parseTest } from '../../src/txt.js';
import { issueTest, copyTest } from '../../src/testfile.js';
import { giveRelease, takeRelease } from '../../src/release.js';
import { scoreAttempt, summarize } from '../../src/score.js';
import { cancelTest } from '../../src/cancel.js';
import { approveSource, readApproval, sendReport } from '../../src/director.js';
import { dearmor } from '../../src/armor.js';
import { shuffled } from '../../src/shuffle.js';

const live = async (p) => importKeys(p, p.keys);
export const superintendent = () => live(cast.superintendent);
export const rtc = (i) => live(cast.rtcs[i]);
export const crewOf = (i) => Promise.all(cast.crew.filter((c) => c.rtc === i).map(live));
export const tests = cast.tests;
export const names = { superintendent: cast.superintendent.name, rtcs: cast.rtcs.map((r) => r.name), crew: cast.crew.map((c) => c.name) };

/** Registrations (role none) as the cast would send them. */
export const registrationsOf = async (people) => Promise.all(people.map(async (p) => ({ name: `registration-${p.name.replace(/\s+/g, '-')}.txt`, text: await profileText(registration(p)), from: p.name })));
/** Mint the user's public profile as `role` with a cast member's keys. */
export const mintUser = async (minter, userPub, role, start) => profileText(await mintProfile(minter, userPub, role, start));

/** An attempt as a cast member would make it: answers by skill, a timeline, a break for the weak. */
const attemptFor = (test, order, complete, c) => {
  const answers = answersFor(test, c.skill, c.pin); const events = [[Date.now() - 1800000, 'copy', complete]];
  let tm = Date.now() - 1790000; for (const id of order) { events.push([tm, 'show', id]); tm += 30000; if (answers[id] !== undefined) { events.push([tm, 'answer', id, answers[id]]); tm += 5000; } }
  const breaks = c.skill < 0.7 ? [{ at: tm, ms: 25000, why: 'blur' }] : [];
  if (breaks.length) { events.push([tm, 'break', 'blur'], [tm + 25000, 'resume']); tm += 30000; }
  events.push([tm, 'submit', 'done']);
  return { started: events[0][0], finished: tm, answers, events, breaks, ua: 'cast' };
};
const shortMarks = (test, c) => Object.fromEntries(test.items.filter((it) => it.type === 'short').map((it) => [it.id, c.skill > 0.75 ? 1 : 0]));
/** The crew member Kowalczyk marks down: best skill, worst rating, in his class. */
export const victim = () => cast.crew.filter((c) => c.rtc === 1 && c.rating <= 2).sort((x, y) => y.skill - x.skill)[0];

/** The user's approval of Test 1, found among the approvals Ballast exported. Null if they skipped approving. */
export const userApprovalOf = async (texts) => { const { sourceHash } = await import('../../src/profile.js'); const want = await sourceHash(tests[0].source); for (const t of texts) { try { const a = await readApproval(t); if (a.hash === want) return a; } catch { /* not an approval */ } } return null; };

/** Test 1, really administered by the three cast RTCs under `approval` (the user's, so audit copies are sealed to the user). Memoised: hashes must stay put. */
let admin = null;
export const administer = async (approval) => admin ??= await (async () => {
  const { test } = await parseTest(tests[0].source); const out = [];
  for (const [i, r] of cast.rtcs.entries()) {
    const teacher = await rtc(i); const crew = await crewOf(i);
    const from = Date.now() - 86400000 * (4 + i), until = from + 86400000 * 3;
    const { text, record } = await issueTest(test, teacher, crew, {}, r.name.split(' ')[1].toUpperCase().slice(0, 3), approval, { from: new Date(from).toISOString(), until: new Date(until).toISOString() });
    const rows = [];
    for (const c of crew) {
      const copy = await copyTest(text, c, c.pin, from + 3600000); const attempt = attemptFor(test, copy.order, copy.complete, c);
      const rel = await giveRelease(copy, c, c.pin, attempt); const taken = await takeRelease(rel, teacher, record, c.sig);
      rows.push({ c, rel, taken, s: scoreAttempt(test, taken.attempt, shortMarks(test, c)) });
    }
    out.push({ i, r, teacher, test, record, rows });
  }
  return out;
})();

/** The three RTCs file class profiles on Test 1 to the user-as-superintendent. Kowalczyk's profile is doctored: the victim loses two marks. */
export const classProfilesFor = async (userSupPub, approval) => {
  const out = [];
  for (const { i, r, teacher, test, record, rows } of await administer(approval)) {
    const sum = summarize(test, rows.map((x) => x.s));
    const report = { test: record.id, title: test.title, hash: record.hash, window: record.window, approved: true, rtc: { name: r.name, pin: r.pin }, class: `Block A · ${r.name.split(' ')[1]}`, issued: Date.parse(record.window.from), sent: Date.now() - 3600000 * i,
      pass: test.settings.pass, n: sum.n, passed: sum.passed, mean: sum.mean, byArea: sum.byArea.map((a) => ({ id: a.id, label: a.label, mean: a.mean })), hardest: sum.byItem.slice(0, 5).map((x) => ({ id: x.id, ref: x.ref, difficulty: x.difficulty })),
      rows: rows.map(({ c, taken, s }) => { const pct = (a) => (a.total ? a.correct / a.total : null); return { pin: c.pin, name: c.name, score: s.score, total: s.total, grade: s.grade, pass: s.pass, pending: 0, breaks: taken.attempt.breaks.length, identity: 'ok', release: taken.hash, signed: taken.signed, late: taken.late, marks: s.perItem.map((x) => [x.id, x.got]), areas: s.areas.map((a) => ({ id: a.id, label: a.label, correct: a.correct, total: a.total })),
        strengths: s.areas.filter((a) => pct(a) !== null && pct(a) >= 0.8).map((a) => a.label), weaknesses: s.areas.filter((a) => pct(a) !== null && pct(a) < 0.6).map((a) => a.label), read: s.read, rating: c.rating, note: c.note }; }) };
    if (i === 1) { const v = victim(); const row = report.rows.find((x) => x.pin === v.pin); let cut = 2; row.marks = row.marks.map(([id, got]) => (got > 0 && cut-- > 0 ? [id, 0] : [id, got])); row.score -= 2; row.grade = row.score / row.total; row.pass = row.grade >= test.settings.pass; report.passed = report.rows.filter((x) => x.pass).length; report.mean = report.rows.reduce((n, x) => n + x.grade, 0) / report.rows.length; }
    out.push({ name: `class-profile-${test.title.replace(/\W+/g, '-')}-${r.name.split(' ')[1]}.txt`, text: await sendReport(teacher, userSupPub, report), from: r.name });
  }
  return out;
};
/** The victim's appeal: their release file, as they would send it to the superintendent. */
export const appealFor = async (approval) => { const v = victim(); const row = (await administer(approval)).find((x) => x.i === 1).rows.find((x) => x.c.pin === v.pin); return { name: `release-${v.name.replace(/\s+/g, '-')}.txt`, text: row.rel, from: v.name, score: row.s }; };
const b64id = (i) => btoa(String.fromCharCode(...new Uint8Array(16).map((_, k) => (k * 37 + i * 11 + 5) & 255))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Answers for a test with a given skill: right with probability `skill`, deterministic per pin. */
const answersFor = (test, skill, pin) => {
  const rng = mulberry(fnv(pin + test.title)); const a = {};
  for (const it of test.items) {
    if (it.type === 'mc') a[it.id] = rng() < skill ? it.key : it.options.find((o) => o.id !== it.key).id;
    else if (it.type === 'match') a[it.id] = Object.fromEntries(it.pairs.map((p) => [p.id, rng() < skill ? p.id : it.pairs[(it.pairs.indexOf(p) + 1) % it.pairs.length].id]));
    else a[it.id] = rng() < skill ? 'both crew members verify their copy, the designation and the engine number' : 'the conductor checks it';
  }
  return a;
};
const fnv = (s) => { let x = 2166136261 >>> 0; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x; };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** The superintendent approves a source (for the RTC phase's inbox). */
export const approvalFor = async (source, title) => approveSource(await superintendent(), source, title);

/** Crew of group `i` write the test the user issued (a real TEST file) and release. */
export const releasesFor = async (testText, i) => {
  const crew = await crewOf(i); const out = [];
  for (const c of crew) {
    let t; try { t = await copyTest(testText, c, c.pin); } catch { continue; } // not on this test
    const { test } = await parseTest(tests.find((x) => x.source.includes(t.title.split(' ·')[0]))?.source || tests[0].source);
    const answers = answersFor(test, c.skill, c.pin); const events = [[Date.now() - 1800000, 'copy', t.complete]];
    let tm = Date.now() - 1790000; for (const id of t.order) { events.push([tm, 'show', id]); tm += 30000; if (answers[id] !== undefined) { events.push([tm, 'answer', id, answers[id]]); tm += 5000; } }
    if (c.skill < 0.7) { events.push([tm, 'break', 'blur']); events.push([tm + 25000, 'resume']); tm += 30000; }
    events.push([tm, 'submit', 'done']);
    const breaks = c.skill < 0.7 ? [{ at: tm - 30000, ms: 25000, why: 'blur' }] : [];
    out.push({ name: `release-${c.name.replace(/\s+/g, '-')}.txt`, text: await giveRelease(t, c, c.pin, { started: events[0][0], finished: tm, answers, events, breaks, ua: 'cast' }), from: c.name });
  }
  return out;
};

/** A cast RTC issues a test to the user-as-crew; later scores the user's release and cancels. */
export const testForUser = async (i, userProfile, k = 1) => {
  const teacher = await rtc(i); const { test } = await parseTest(tests[k].source);
  const approval = await readApproval(await approvalFor(tests[k].source, test.title));
  const { text, record } = await issueTest(test, teacher, [userProfile], {}, teacher.name.split(' ')[1].toUpperCase().slice(0, 3), approval);
  return { name: `${test.title.replace(/\W+/g, '-')}.test.txt`, text, from: teacher.name, record, test, teacher };
};
export const cancelForUser = async (issued, releaseText, userProfile) => {
  const { pin, train, attempt, hash } = await takeRelease(releaseText, issued.teacher, issued.record, userProfile?.sig);
  const marks = Object.fromEntries(issued.test.items.filter((it) => it.type === 'short').map((it) => [it.id, (attempt.answers[it.id] || '').length > 12 ? 1 : 0]));
  const s = scoreAttempt(issued.test, attempt, marks);
  return { name: `cancel-${pin}.txt`, text: await cancelTest(issued.record, issued.teacher, train, pin, s, { hash, answers: attempt.answers }), from: issued.teacher.name, score: s };
};
