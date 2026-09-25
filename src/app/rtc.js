// The RTC's desk: register, the sheet, trains (with photos), tests (with approvals), releases, reports to the superintendent.
import { h, mount, download, readFileText, readFileBytes, fmtTime } from './h.js';
import { sniff, dearmor, blocks, bundle } from '../armor.js';
import { readProfile, profileText, mintProfile } from '../profile.js';
import * as store from './store.js';
import { parseTest } from '../txt.js';
import { issueTest, openItem, defaultWindow } from '../testfile.js';
import { takeRelease } from '../release.js';
import { scoreAttempt, summarize } from '../score.js';
import { cancelTest } from '../cancel.js';
import { newSheet, openSheet, saveSheet } from '../sheet.js';
import { readApproval, checkApproval, sendReport } from '../director.js';
import { fold } from './attempt.js';
import { drawItem, imagesFor } from './draw.js';
import { b64 } from '../bytes.js';
import { profileCard, avatar } from './profile-ui.js';
import { announce, embedded } from '../embed.js';

let sheet = null, tab = 'trains', pass = '', notes = [], view = null, root, go, klass = '';
const note = (m, bad = false) => { notes.unshift({ m, bad }); notes = notes.slice(0, 6); };
const rerender = () => render(root, {}, go);

// ---------- intake
const intake = async (items) => {
  for (const it of items) {
    try {
      if (it.error) { note(`${it.name}: ${it.error}`, true); continue; }
      if (it.asset) { const bytes = await readFileBytes(it.asset); sheet.assets[it.name] = { mime: it.asset.type || 'image/jpeg', b64: b64(bytes) }; note(`asset ${it.name} (${Math.round(bytes.length / 1024)} KB)`); continue; }
      if (it.source) { const { test, errors } = await parseTest(it.text); sheet.draft = { name: it.name, source: it.text, test: errors.length ? null : test, errors }; note(errors.length ? `${it.name}: ${errors.length} problem(s) — ${errors[0]}` : `test source ${it.name}: ${test.items.length} items`, !!errors.length); tab = 'tests'; continue; }
      const kind = sniff(it.text);
      if (kind === 'PROFILE') { const p = await readProfile(it.text); if (p.role === 'superintendent') { sheet.superintendent = p; note(`superintendent ${p.name} on the desk`); continue; } if (p.role === 'none') { sheet.pending = sheet.pending.filter((x) => x.pub !== p.pub); sheet.pending.push(p); note(`registration from ${p.name} (${p.pin}) — mint it on the Crew tab`); tab = 'trains'; continue; } if (p.role !== 'crew') { note(`${p.name} is an ${p.role}, not crew`, true); continue; } const i = sheet.trains.findIndex((t) => t.pin === p.pin); if (i >= 0 && sheet.trains[i].pub !== p.pub) note(`Crew ${p.pin} re-registered with a new key (${p.name}); replaced`, true); if (i >= 0) sheet.trains[i] = p; else sheet.trains.push(p); note(`crew Crew ${p.pin} ${p.name}`); tab = 'trains'; }
      else if (kind === 'APPROVAL') { const a = await readApproval(it.text); sheet.approvals = sheet.approvals.filter((x) => x.hash !== a.hash); sheet.approvals.push(a); note(`approval for "${a.title}" by ${a.name}`); tab = 'tests'; }
      else if (kind === 'RELEASE') { const { body } = await dearmor(it.text); const rec = sheet.tests.find((t) => t.id === body.test); if (!rec) throw new Error('release is for a test not on this sheet'); const onSheet0 = sheet.trains.find((t) => t.pub === body.train); const r = await takeRelease(it.text, sheet.rtc, rec, onSheet0?.sig); const onSheet = sheet.trains.find((t) => t.pin === r.pin); const identity = onSheet && onSheet.pub === r.train ? (r.signed === false ? 'BAD SIGNATURE' : 'ok') : 'KEY MISMATCH'; sheet.releases = sheet.releases.filter((x) => !(x.test === rec.id && x.pin === r.pin)); sheet.releases.push({ test: rec.id, pin: r.pin, train: r.train, identity, attempt: r.attempt, name: onSheet?.name || '?', hash: r.hash, signed: r.signed, late: r.late }); note(`release Crew ${r.pin} for ${rec.title} · ${r.hash.slice(0, 12)}${identity !== 'ok' ? ' — ' + identity : ''}${r.late ? ' — LATE (after the window)' : ''}`, identity !== 'ok' || r.late); tab = 'releases'; }
      else if (kind) note(`${it.name}: a ${kind} does not belong on the desk`, true);
      else note(`${it.name}: not recognised`, true);
    } catch (e) { note(`${it.name}: ${e.message}`, true); }
  }
};
const takeFiles = async (files) => { const items = []; for (const f of files) { if (/\.(png|jpe?g|gif|webp)$/i.test(f.name)) items.push({ name: f.name, asset: f }); else { const text = await readFileText(f); const bs = blocks(text); if (bs.length > 1) bs.forEach((b, i) => items.push({ name: `${f.name} #${i + 1}`, text: b })); else items.push(sniff(text) ? { name: f.name, text } : { name: f.name, text, source: true }); } } await intake(items); rerender(); };
/** Fan out: many files at once. In Chrome, into a folder you pick; elsewhere (and when embedded), one download each. */
const exportAll = async (files, bundleName) => {
  if (typeof window.showDirectoryPicker === 'function' && !embedded()) { try { const dir = await window.showDirectoryPicker({ mode: 'readwrite' }); for (const [name, text] of files) { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(text); await w.close(); } return note(`${files.length} files written to the folder`); } catch (e) { if (e.name === 'AbortError') return; } }
  for (const [name, text] of files) download(name, text); if (bundleName) download(bundleName, bundle(files.map(([, t]) => t))); note(`${files.length} files downloaded${bundleName ? ' — and one bundle of them all' : ''}`);
};

// ---------- tabs
const mint = async (reg) => { const m = await mintProfile(sheet.rtc, reg, 'crew'); sheet.pending = sheet.pending.filter((x) => x !== reg); sheet.trains = sheet.trains.filter((t) => t.pin !== m.pin); sheet.trains.push(m); download(`profile-crew-${m.pin}.txt`, await profileText(m)); note(`minted crew Crew ${m.pin} ${m.name} — send them the profile`); rerender(); };
const classOf = (pin) => sheet.classes.find((c) => c.pins.includes(pin));
const classBar = () => h('div', { class: 'row' }, h('b', {}, 'Class:'), h('select', { onchange: (e) => { klass = e.target.value; rerender(); } }, h('option', { value: '', selected: klass === '' }, 'all crew'), sheet.classes.map((c) => h('option', { value: c.id, selected: klass === c.id }, `${c.name} (${c.pins.length})`))),
  h('button', { onclick: () => { const name = prompt('Class name (e.g. Block C · Sept 2026)'); if (!name) return; const c = { id: 'c' + Date.now().toString(36), name, pins: [] }; sheet.classes.push(c); klass = c.id; note(`class ${name}`); rerender(); } }, 'New class'),
  klass ? h('button', { onclick: () => { const c = sheet.classes.find((x) => x.id === klass); if (c && confirm(`Delete class ${c.name}? Crew stay on the sheet.`)) { sheet.classes = sheet.classes.filter((x) => x !== c); klass = ''; rerender(); } } }, 'Delete class') : null);
const noteBox = (t) => { const n = (sheet.notes[t.pin] ??= { rating: 0, note: '' }); return h('div', {}, h('select', { onchange: (e) => { n.rating = Number(e.target.value); } }, [0, 1, 2, 3, 4, 5].map((v) => h('option', { value: v, selected: n.rating === v }, v ? '★'.repeat(v) : 'unrated'))), h('textarea', { rows: 2, placeholder: 'Appraisal — goes to the superintendent with the class profile', value: n.note, oninput: (e) => { n.note = e.target.value; } })); };
const trainsTab = () => h('div', {}, classBar(), sheet.trains.length ? h('button', { onclick: async () => { const files = []; for (const t of sheet.trains) files.push([`profile-crew-${t.pin}.txt`, await profileText(t)]); await exportAll(files); rerender(); } }, 'Export all minted profiles') : null, sheet.pending.length ? h('div', { class: 'card' }, h('h2', {}, 'Registrations to mint'), h('table', {}, sheet.pending.map((r) => h('tr', {}, h('td', {}, avatar(r, 48)), h('td', {}, r.name), h('td', {}, r.pin), h('td', {}, h('button', { class: 'primary', onclick: () => mint(r) }, 'Mint as crew'), ' ', h('button', { onclick: () => { sheet.pending = sheet.pending.filter((x) => x !== r); rerender(); } }, 'discard')))))) : null,
  h('p', { class: 'small' }, 'Drop registrations on the desk and mint them; the minted profile goes back to the crew member. Minted crew profiles from other RTCs are accepted too.'),
  h('table', {}, h('tr', {}, h('th'), h('th', {}, 'Crew'), h('th', {}, 'Class'), h('th', {}, 'Rating & appraisal'), h('th')),
    sheet.trains.filter((t) => !klass || classOf(t.pin)?.id === klass).sort((a, b) => a.pin.localeCompare(b.pin)).map((t) => h('tr', {}, h('td', {}, avatar(t, 48)), h('td', {}, h('b', {}, t.name), h('br'), `Crew ${t.pin}`, h('div', { class: 'small' }, `since ${t.minted?.start || '?'}`)),
      h('td', {}, h('select', { onchange: (e) => { for (const c of sheet.classes) c.pins = c.pins.filter((p) => p !== t.pin); const c = sheet.classes.find((x) => x.id === e.target.value); if (c) c.pins.push(t.pin); rerender(); } }, h('option', { value: '', selected: !classOf(t.pin) }, '—'), sheet.classes.map((c) => h('option', { value: c.id, selected: classOf(t.pin)?.id === c.id }, c.name)))),
      h('td', {}, noteBox(t)), h('td', {}, h('button', { onclick: () => { sheet.trains = sheet.trains.filter((x) => x !== t); rerender(); } }, 'remove'))))),
  sheet.trains.length ? null : h('p', { class: 'status' }, 'No crew yet.'));

const approvalFor = async (source) => { for (const a of sheet.approvals) if (await checkApproval(a, source)) return a; return null; };
let issueTo = '', win = null;
const local = (iso) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const testsTab = () => {
  const d = sheet.draft; if (issueTo === '' && klass) issueTo = klass; win ??= defaultWindow();
  const issue = async () => {
    if (!d?.test) return;
    const missing = [...new Set(d.test.items.flatMap((i) => i.img.map((im) => im.name)).filter((n) => !sheet.assets[n]))];
    if (missing.length) return note(`missing assets: ${missing.join(', ')} — drop them on the desk`, true), rerender();
    const c = sheet.classes.find((x) => x.id === issueTo); const crew = c ? sheet.trains.filter((t) => c.pins.includes(t.pin)) : sheet.trains;
    if (!crew.length) return note(c ? `no crew in ${c.name}` : 'no crew on the sheet', true), rerender();
    const approval = await approvalFor(d.source);
    let text, record; try { ({ text, record } = await issueTest(d.test, sheet.rtc, crew, sheet.assets, sheet.rtc.name, approval, win)); } catch (e) { return note(e.message, true), rerender(); }
    Object.assign(record, { source: d.source, text, issued: Date.now(), trains: crew.map((t) => t.pin), approved: !!approval, class: c?.name || 'all crew', classId: c?.id || '' });
    sheet.tests.push(record); download(`${d.test.title.replace(/\W+/g, '-')}.test.txt`, text); note(`issued ${record.title} to ${sheet.trains.length} crew — complete ${record.hash.slice(0, 4).toUpperCase()}`); rerender();
  };
  const approvedMark = h('span', { class: 'small' }); if (d?.test) approvalFor(d.source).then((a) => { approvedMark.textContent = a ? ` · approved by ${a.name}` : ' · not approved'; approvedMark.className = a ? 'small good' : 'small bad'; });
  return h('div', {}, h('p', { class: 'small' }, 'Drop a test source (.txt), any images it names, and the superintendent\'s approval if you have one. Issue writes one test file with a clearance for every crew member on the sheet.'),
    d ? h('div', { class: 'card' }, h('b', {}, d.name), d.errors.length ? h('ul', { class: 'bad' }, d.errors.map((e) => h('li', {}, e))) : h('p', {}, `${d.test.title} · ${d.test.items.length} items · ${fmtTime(d.test.settings.time)} · pass ${Math.round(d.test.settings.pass * 100)}% · areas: ${d.test.areas.map((a) => a.id).join(', ') || 'none'}`, approvedMark),
      d.errors.length ? null : h('div', { class: 'row' }, h('label', {}, 'opens ', h('input', { type: 'datetime-local', value: local(win.from), onchange: (e) => { win = { ...win, from: new Date(e.target.value).toISOString() }; } })), h('label', {}, 'closes ', h('input', { type: 'datetime-local', value: local(win.until), onchange: (e) => { win = { ...win, until: new Date(e.target.value).toISOString() }; } })), h('select', { onchange: (e) => { issueTo = e.target.value; } }, h('option', { value: '', selected: !issueTo }, `all crew (${sheet.trains.length})`), sheet.classes.map((c) => h('option', { value: c.id, selected: issueTo === c.id }, `${c.name} (${c.pins.length})`))), h('button', { class: 'primary', onclick: issue }, 'Issue test'))) : h('p', { class: 'status' }, 'No test source loaded.'),
    h('h2', {}, 'Issued'), h('table', {}, sheet.tests.map((t) => h('tr', {}, h('td', {}, t.title), h('td', { class: 'small' }, t.class || ''), h('td', { class: 'small' }, new Date(t.issued).toLocaleString()), h('td', {}, `${t.trains?.length ?? '?'} clearances`), h('td', { class: 'small' }, t.window ? `${new Date(t.window.from).toLocaleString()} → ${new Date(t.window.until).toLocaleString()}` : ''), h('td', { class: t.approved ? 'good small' : 'small' }, t.approved ? 'approved' : 'unapproved'), h('td', { class: 'complete small' }, t.hash.slice(0, 4).toUpperCase()), h('td', {}, h('button', { onclick: () => download(`${t.title.replace(/\W+/g, '-')}.test.txt`, t.text) }, 'download again'))))),
    h('h2', {}, 'Assets'), h('p', { class: 'small' }, Object.keys(sheet.assets).join(', ') || 'none'), h('h2', {}, 'Approvals'), h('p', { class: 'small' }, sheet.approvals.map((a) => `${a.title} (${a.name})`).join(', ') || 'none'));
};

const marksFor = (rec, pin) => (sheet.marks[`${rec.id}:${pin}`] ??= {});
const scoredFor = (rec, test) => sheet.releases.filter((r) => r.test === rec.id).map((r) => ({ r, s: scoreAttempt(test, r.attempt, marksFor(rec, r.pin)) }));
const releasesTab = () => {
  const groups = sheet.tests.filter((rec) => sheet.releases.some((r) => r.test === rec.id));
  if (!groups.length) return h('p', { class: 'status' }, 'No releases yet. Drop release files or pasted RELEASE text on the desk.');
  return h('div', {}, groups.map((rec) => h('div', { class: 'card' }, h('h2', {}, rec.title), rec._test ? releaseTable(rec, rec._test) : h('button', { onclick: async () => { rec._test = (await parseTest(rec.source)).test; rerender(); } }, 'Score'))));
};
/** The cancellation names the release it marks (by file hash) and repeats the answers as marked, so the crew member can compare. */
const cancel = (rec, r, s) => cancelTest(rec, sheet.rtc, r.train, r.pin, s, { hash: r.hash, answers: r.attempt.answers });
const releaseTable = (rec, test) => {
  const scored = scoredFor(rec, test); const sum = summarize(test, scored.map((x) => x.s));
  const photo = (pin) => avatar(sheet.trains.find((t) => t.pin === pin) || { name: '?' }, 40);
  return h('div', {}, h('p', {}, `${sum.n} released · ${sum.passed} passed · mean ${Math.round(sum.mean * 100)}%`),
    h('table', {}, h('tr', {}, h('th'), h('th', {}, 'Train'), h('th', {}, 'Name'), h('th', {}, 'Score'), h('th', {}, 'Grade'), h('th', {}, 'Breaks'), h('th', {}, 'Identity'), h('th', {}, 'Release'), h('th')),
      scored.map(({ r, s }) => h('tr', {}, h('td', {}, photo(r.pin)), h('td', {}, `Crew ${r.pin}`), h('td', {}, r.name), h('td', {}, `${s.score}/${s.total}${s.pending ? ` (+${s.pending} unmarked)` : ''}`), h('td', { class: s.pass ? 'good' : 'bad' }, `${Math.round(s.grade * 100)}%`), h('td', {}, r.attempt.breaks?.length || 0), h('td', { class: r.identity === 'ok' ? 'good' : 'bad' }, r.identity), h('td', { class: 'small complete' }, (r.hash || '').slice(0, 12), r.signed === false ? h('span', { class: 'bad' }, ' unsigned!') : '', r.late ? h('span', { class: 'bad' }, ' late') : ''),
        h('td', {}, h('button', { onclick: () => { view = { rec, test, r }; rerender(); } }, 'review'), ' ', h('button', { onclick: async () => download(`cancel-${r.pin}.txt`, await cancel(rec, r, s)) }, 'cancel (send marks)'))))),
    h('div', { class: 'row' }, h('button', { onclick: async () => { const files = []; for (const { r, s } of scored) files.push([`cancel-${r.pin}.txt`, await cancel(rec, r, s)]); await exportAll(files, `cancellations-${rec.title.replace(/\W+/g, '-')}.txt`); rerender(); } }, 'Cancel all (export)'), h('button', { onclick: () => download(`${rec.title.replace(/\W+/g, '-')}-summary.csv`, csv(test, scored)) }, 'Summary CSV'),
      sheet.superintendent ? h('button', { onclick: async () => download(`class-profile-${rec.title.replace(/\W+/g, '-')}.txt`, await sendReport(sheet.rtc, sheet.superintendent.pub, reportFor(rec, test, scored, sum))) }, `Class profile to ${sheet.superintendent.name}`) : h('span', { class: 'small' }, 'Drop the superintendent\'s profile on the desk to send reports.')),
    h('h2', {}, 'By area (class mean)'), h('table', {}, sum.byArea.map((a) => h('tr', {}, h('td', {}, a.label), h('td', {}, `${Math.round(a.mean * 100)}%`), h('td', {}, h('div', { class: 'meter' }, h('div', { style: { width: Math.round(a.mean * 100) + '%' } })))))),
    h('h2', {}, 'Hardest items'), h('table', {}, sum.byItem.slice(0, 10).map((i) => h('tr', {}, h('td', {}, i.id), h('td', {}, i.ref.join(', ')), h('td', {}, `${i.correct}/${i.n} fully correct`)))));
};
const reportFor = (rec, test, scored, sum) => ({ test: rec.id, title: rec.title, hash: rec.hash, window: rec.window || null, approved: !!rec.approved, rtc: { name: sheet.rtc.name, pin: sheet.rtc.pin }, class: rec.class || '', issued: rec.issued, sent: Date.now(),
  pass: test.settings.pass, n: sum.n, passed: sum.passed, mean: sum.mean, byArea: sum.byArea.map((a) => ({ id: a.id, label: a.label, mean: a.mean })), hardest: sum.byItem.slice(0, 10).map((i) => ({ id: i.id, ref: i.ref, difficulty: i.difficulty })),
  rows: scored.map(({ r, s }) => { const n = sheet.notes[r.pin] || { rating: 0, note: '' }; const pct = (a) => (a.total ? a.correct / a.total : null); return { pin: r.pin, name: r.name, score: s.score, total: s.total, grade: s.grade, pass: s.pass, pending: s.pending, breaks: r.attempt.breaks?.length || 0, identity: r.identity, release: r.hash || null, signed: r.signed ?? null, late: !!r.late, marks: s.perItem.map((i) => [i.id, i.got]), areas: s.areas.map((a) => ({ id: a.id, label: a.label, correct: a.correct, total: a.total })),
    strengths: s.areas.filter((a) => pct(a) !== null && pct(a) >= 0.8).map((a) => a.label), weaknesses: s.areas.filter((a) => pct(a) !== null && pct(a) < 0.6).map((a) => a.label), read: s.read, rating: n.rating, note: n.note }; }) });
const csv = (test, scored) => { const head = ['pin', 'name', 'score', 'total', 'grade', 'pass', 'breaks', 'identity', 'release', ...test.areas.map((a) => a.id), ...test.items.map((i) => i.id)]; const rows = scored.map(({ r, s }) => [r.pin, r.name, s.score, s.total, s.grade.toFixed(3), s.pass, r.attempt.breaks?.length || 0, r.identity, r.hash || '', ...s.areas.map((a) => `${a.correct}/${a.total}`), ...s.perItem.map((i) => i.got)]); return [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'); };

const reviewView = () => {
  const { rec, test, r } = view; const marks = marksFor(rec, r.pin); const s = scoreAttempt(test, r.attempt, marks);
  const raw = { items: JSON.parse(atob(rec.text.split('\n\n')[1].replace(/-----END[\s\S]*$/, '').replace(/\s+/g, ''))).items };
  const canvas = h('canvas', { width: 900, height: 600, style: { width: '100%', border: '1px solid #ddd' } });
  const order = r.attempt.events.filter((e) => e[1] === 'show').map((e) => e[2]).filter((v, i, a) => a.indexOf(v) === i);
  let cursor = r.attempt.events.length; const slider = h('input', { type: 'range', min: 0, max: r.attempt.events.length, value: cursor, oninput: (e) => { cursor = Number(e.target.value); paint(); } }); const info = h('p', { class: 'small' });
  const paint = async () => { const st = fold(order, r.attempt.events.slice(0, cursor)); const id = order[st.at]; if (!id) return; const item = await openItem(rec, raw, id); if (item.pairs?.length) item.rights = item.pairs.map((p) => ({ id: p.id, text: p.right })); drawItem(canvas, item, { answer: st.answers[id], images: await imagesFor(item), watermark: 'REVIEW', index: st.at, count: order.length }); const ev = r.attempt.events[cursor - 1]; info.textContent = ev ? `event ${cursor}/${r.attempt.events.length}: ${ev[1]} ${ev[2] ?? ''} at +${Math.round((ev[0] - r.attempt.started) / 1000)}s` : ''; };
  paint();
  const crewRow = sheet.trains.find((t) => t.pin === r.pin);
  return h('div', {}, h('button', { onclick: () => { view = null; rerender(); } }, '← back'), h('div', { class: 'row' }, avatar(crewRow || { name: '?' }, 56), h('h2', {}, `Crew ${r.pin} ${r.name} — ${rec.title}: ${s.score}/${s.total} (${Math.round(s.grade * 100)}%)`)), crewRow ? h('div', { class: 'card' }, h('b', {}, 'Rating & appraisal'), noteBox(crewRow)) : null,
    h('h2', {}, 'Answers'), h('table', {}, test.items.map((it) => { const a = r.attempt.answers[it.id]; const pi = s.perItem.find((x) => x.id === it.id);
      return h('tr', {}, h('td', { class: 'small' }, it.id, h('br'), it.ref.join(', ')), h('td', {}, it.prompt.split('\n')[0].slice(0, 90)),
        h('td', {}, it.type === 'short' ? h('div', {}, h('div', {}, h('b', {}, 'answer: '), a || '—'), h('div', { class: 'small' }, h('b', {}, 'model: '), it.answer), h('label', {}, 'mark ', h('input', { type: 'number', min: 0, max: it.worth, step: 0.5, value: marks[it.id] ?? '', style: { width: '70px' }, onchange: (e) => { marks[it.id] = Number(e.target.value); rerender(); } }))) : it.type === 'match' ? Object.entries(a || {}).map(([l, rr]) => `${l}→${rr} `).join('') || '—' : `${a ?? '—'} (key ${it.key})`),
        h('td', { class: pi.pending ? 'status' : pi.got === pi.worth ? 'good' : 'bad' }, pi.pending ? 'unmarked' : `${pi.got}/${pi.worth}`)); })),
    h('h2', {}, 'Breaks'), r.attempt.breaks?.length ? h('ul', {}, r.attempt.breaks.map((b) => h('li', {}, `${b.why} for ${Math.round(b.ms / 1000)} s at +${Math.round((b.at - r.attempt.started) / 1000)} s`))) : h('p', {}, 'none'),
    h('h2', {}, 'Playback'), slider, info, canvas);
};

// ---------- the desk
export const render = async (r, ctx, g) => {
  root = r; go = g;
  if (ctx.fresh) { sheet = await newSheet(await store.get('profile')); note('new sheet'); }
  if (ctx.sheetText) { const pw = prompt('Sheet passphrase'); if (pw == null) return go({ screen: 'home' }); try { sheet = await openSheet(ctx.sheetText, pw); pass = pw; note(`opened sheet for ${sheet.rtc.name}`); } catch (e) { return go({ screen: 'home', error: e.message }); } }
  if (!sheet) { const p = await store.get('profile'); return mount(root, h('h1', {}, 'RTC'), profileCard(p, await profileText(p)), h('p', {}, 'Your desk is a sheet file, encrypted under your passphrase. Open yours, or start a new one.'), h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => go({ screen: 'rtc', fresh: true }) }, 'Start a sheet'), h('label', { class: 'btn' }, 'Open a sheet', h('input', { type: 'file', style: { display: 'none' }, onchange: async (e) => go({ screen: 'rtc', sheetText: await readFileText(e.target.files[0]) }) })))); }
  for (const k of ['marks', 'assets', 'notes']) sheet[k] ??= {}; for (const k of ['releases', 'approvals', 'trains', 'tests', 'pending', 'classes']) sheet[k] ??= [];
  if (ctx.incoming) { await intake(ctx.incoming); ctx.incoming = null; }
  const save = async () => { if (!pass) { pass = prompt('Choose a passphrase for this sheet (you will need it every time)') || ''; if (!pass) return; } const { draft, ...persist } = sheet; for (const t of persist.tests) delete t._test; download(`sheet-${sheet.rtc.name.replace(/\W+/g, '-')}.txt`, await saveSheet(persist, pass)); note('sheet saved'); rerender(); };
  const drop = h('div', { class: 'drop', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); takeFiles(e.dataTransfer.files); } },
    'Drop registrations, test sources, images, approvals, releases here', h('br'), h('label', { class: 'btn', style: { marginTop: '8px', display: 'inline-block' } }, 'Choose files', h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: (e) => takeFiles(e.target.files) })));
  announce('desk', sheet.rtc); // the sheet is open: a different screen than the bare role home
  const paste = h('textarea', { rows: 3, placeholder: 'Or paste PROFILE / APPROVAL / RELEASE text…' });
  mount(root, h('div', { class: 'bar' }, h('span', { class: 'row' }, avatar(sheet.rtc, 28), ` RTC ${sheet.rtc.name}`), h('span', {}, `${sheet.trains.length} crew · ${sheet.tests.length} tests · ${sheet.releases.length} releases`), h('button', { onclick: save }, 'Save sheet')),
    h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, drop), profileCard(sheet.rtc, await profileText(sheet.rtc))),
    h('div', { class: 'row' }, paste, h('button', { onclick: async () => { await intake([{ name: 'pasted', text: paste.value }]); paste.value = ''; rerender(); } }, 'Take')),
    notes.length ? h('ul', { class: 'small' }, notes.map((n) => h('li', { class: n.bad ? 'bad' : '' }, n.m))) : null,
    view ? reviewView() : h('div', {}, h('div', { class: 'tabs' }, [['trains', 'Crew'], ['tests', 'Tests'], ['releases', 'Releases']].map(([t, l]) => h('button', { class: tab === t ? 'on' : '', onclick: () => { tab = t; rerender(); } }, l))), tab === 'trains' ? trainsTab() : tab === 'tests' ? testsTab() : releasesTab()),
    h('p', { class: 'small' }, h('button', { onclick: () => { sheet = null; go({ screen: 'home' }); } }, 'Close desk')));
};
