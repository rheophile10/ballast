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
  ['Emma Sinclair', '123460', 1, 0.92], ['Farid Haddad', '123461', 1, 0.83], ['Grace Whitecloud', '123462', 1, 0.95], ['Hugo Lavoie', '123463', 1, 0.66],
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
