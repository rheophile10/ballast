// The RTC's desk: register, the sheet, trains (with photos), tests (with approvals), releases, reports to the superintendent.
import { h, mount, download, readFileText, readFileBytes, fmtTime } from './h.js';
import { sniff, dearmor } from '../armor.js';
import { readProfile, profileText } from '../profile.js';
import { parseTest } from '../txt.js';
import { issueTGBO, openItem } from '../tgbo.js';
import { takeRelease } from '../release.js';
import { scoreAttempt, summarize } from '../score.js';
import { cancelTGBO } from '../cancel.js';
import { newSheet, openSheet, saveSheet } from '../sheet.js';
import { readApproval, checkApproval, sendReport } from '../director.js';
import { fold } from './attempt.js';
import { drawItem, imagesFor } from './draw.js';
import { b64 } from '../bytes.js';
import { renderRegister, profileCard, avatar } from './profile-ui.js';

let sheet = null, tab = 'trains', pass = '', notes = [], view = null, root, go;
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
      if (kind === 'PROFILE') { const p = await readProfile(it.text); if (p.role === 'superintendent') { sheet.superintendent = p; note(`superintendent ${p.name} on the desk`); continue; } if (p.role !== 'crew') { note(`${p.name} is an ${p.role}, not crew`, true); continue; } const i = sheet.trains.findIndex((t) => t.pin === p.pin); if (i >= 0 && sheet.trains[i].pub !== p.pub) note(`CN ${p.pin} re-registered with a new key (${p.name}); replaced`, true); if (i >= 0) sheet.trains[i] = p; else sheet.trains.push(p); note(`crew CN ${p.pin} ${p.name}`); tab = 'trains'; }
      else if (kind === 'APPROVAL') { const a = await readApproval(it.text); sheet.approvals = sheet.approvals.filter((x) => x.hash !== a.hash); sheet.approvals.push(a); note(`approval for "${a.title}" by ${a.name}`); tab = 'tests'; }
      else if (kind === 'RELEASE') { const { body } = await dearmor(it.text); const rec = sheet.tgbos.find((t) => t.id === body.tgbo); if (!rec) throw new Error('release is for a TGBO not on this sheet'); const r = await takeRelease(it.text, sheet.rtc, rec); const onSheet = sheet.trains.find((t) => t.pin === r.pin); const identity = onSheet && onSheet.pub === r.train ? 'ok' : 'KEY MISMATCH'; sheet.releases = sheet.releases.filter((x) => !(x.tgbo === rec.id && x.pin === r.pin)); sheet.releases.push({ tgbo: rec.id, pin: r.pin, train: r.train, identity, attempt: r.attempt, name: onSheet?.name || '?' }); note(`release CN ${r.pin} for ${rec.title}${identity !== 'ok' ? ' — KEY MISMATCH' : ''}`, identity !== 'ok'); tab = 'releases'; }
      else if (kind) note(`${it.name}: a ${kind} does not belong on the desk`, true);
      else note(`${it.name}: not recognised`, true);
    } catch (e) { note(`${it.name}: ${e.message}`, true); }
  }
};
const takeFiles = async (files) => { const items = []; for (const f of files) { if (/\.(png|jpe?g|gif|webp)$/i.test(f.name)) items.push({ name: f.name, asset: f }); else { const text = await readFileText(f); items.push(sniff(text) ? { name: f.name, text } : { name: f.name, text, source: true }); } } await intake(items); rerender(); };

// ---------- tabs
const trainsTab = () => h('div', {}, h('p', { class: 'small' }, 'Drop crew profiles on the desk. One row per PIN; a new key for a known PIN replaces the old one and is noted.'),
  h('table', {}, sheet.trains.sort((a, b) => a.pin.localeCompare(b.pin)).map((t) => h('tr', {}, h('td', {}, avatar(t, 48)), h('td', {}, `CN ${t.pin}`), h('td', {}, t.name), h('td', { class: 'small' }, t.pub.slice(0, 12) + '…'), h('td', {}, h('button', { onclick: () => { sheet.trains = sheet.trains.filter((x) => x !== t); rerender(); } }, 'remove'))))),
  sheet.trains.length ? null : h('p', { class: 'status' }, 'No trains yet.'));

const approvalFor = async (source) => { for (const a of sheet.approvals) if (await checkApproval(a, source)) return a; return null; };
const testsTab = () => {
  const d = sheet.draft;
  const issue = async () => {
    if (!d?.test) return;
    const missing = [...new Set(d.test.items.flatMap((i) => i.img.map((im) => im.name)).filter((n) => !sheet.assets[n]))];
    if (missing.length) return note(`missing assets: ${missing.join(', ')} — drop them on the desk`, true), rerender();
    if (!sheet.trains.length) return note('no trains on the sheet', true), rerender();
    const approval = await approvalFor(d.source);
    const { text, record } = await issueTGBO(d.test, sheet.rtc, sheet.trains, sheet.assets, sheet.rtc.name, approval);
    Object.assign(record, { source: d.source, tgbo: text, issued: Date.now(), trains: sheet.trains.map((t) => t.pin), approved: !!approval });
    sheet.tgbos.push(record); download(`${d.test.title.replace(/\W+/g, '-')}.tgbo.txt`, text); note(`issued ${record.title} to ${sheet.trains.length} train(s) — complete ${record.hash.slice(0, 4).toUpperCase()}`); rerender();
  };
  const approvedMark = h('span', { class: 'small' }); if (d?.test) approvalFor(d.source).then((a) => { approvedMark.textContent = a ? ` · approved by ${a.name}` : ' · not approved'; approvedMark.className = a ? 'small good' : 'small bad'; });
  return h('div', {}, h('p', { class: 'small' }, 'Drop a test source (.txt), any images it names, and the superintendent\'s approval if you have one. Issue writes one TGBO with a clearance for every train on the sheet.'),
    d ? h('div', { class: 'card' }, h('b', {}, d.name), d.errors.length ? h('ul', { class: 'bad' }, d.errors.map((e) => h('li', {}, e))) : h('p', {}, `${d.test.title} · ${d.test.items.length} items · ${fmtTime(d.test.settings.time)} · pass ${Math.round(d.test.settings.pass * 100)}% · areas: ${d.test.areas.map((a) => a.id).join(', ') || 'none'}`, approvedMark),
      d.errors.length ? null : h('button', { class: 'primary', onclick: issue }, `Issue TGBO to ${sheet.trains.length} train(s)`)) : h('p', { class: 'status' }, 'No test source loaded.'),
    h('h2', {}, 'Issued'), h('table', {}, sheet.tgbos.map((t) => h('tr', {}, h('td', {}, t.title), h('td', { class: 'small' }, new Date(t.issued).toLocaleString()), h('td', {}, `${t.trains?.length ?? '?'} clearances`), h('td', { class: t.approved ? 'good small' : 'small' }, t.approved ? 'approved' : 'unapproved'), h('td', { class: 'complete small' }, t.hash.slice(0, 4).toUpperCase()), h('td', {}, h('button', { onclick: () => download(`${t.title.replace(/\W+/g, '-')}.tgbo.txt`, t.tgbo) }, 'download again'))))),
    h('h2', {}, 'Assets'), h('p', { class: 'small' }, Object.keys(sheet.assets).join(', ') || 'none'), h('h2', {}, 'Approvals'), h('p', { class: 'small' }, sheet.approvals.map((a) => `${a.title} (${a.name})`).join(', ') || 'none'));
};

const marksFor = (rec, pin) => (sheet.marks[`${rec.id}:${pin}`] ??= {});
const scoredFor = (rec, test) => sheet.releases.filter((r) => r.tgbo === rec.id).map((r) => ({ r, s: scoreAttempt(test, r.attempt, marksFor(rec, r.pin)) }));
const releasesTab = () => {
  const groups = sheet.tgbos.filter((rec) => sheet.releases.some((r) => r.tgbo === rec.id));
  if (!groups.length) return h('p', { class: 'status' }, 'No releases yet. Drop release files or pasted RELEASE text on the desk.');
  return h('div', {}, groups.map((rec) => h('div', { class: 'card' }, h('h2', {}, rec.title), rec._test ? releaseTable(rec, rec._test) : h('button', { onclick: async () => { rec._test = (await parseTest(rec.source)).test; rerender(); } }, 'Score'))));
};
const releaseTable = (rec, test) => {
  const scored = scoredFor(rec, test); const sum = summarize(test, scored.map((x) => x.s));
  const photo = (pin) => avatar(sheet.trains.find((t) => t.pin === pin) || { name: '?' }, 40);
  return h('div', {}, h('p', {}, `${sum.n} released · ${sum.passed} passed · mean ${Math.round(sum.mean * 100)}%`),
    h('table', {}, h('tr', {}, h('th'), h('th', {}, 'Train'), h('th', {}, 'Name'), h('th', {}, 'Score'), h('th', {}, 'Grade'), h('th', {}, 'Breaks'), h('th', {}, 'Identity'), h('th')),
      scored.map(({ r, s }) => h('tr', {}, h('td', {}, photo(r.pin)), h('td', {}, `CN ${r.pin}`), h('td', {}, r.name), h('td', {}, `${s.score}/${s.total}${s.pending ? ` (+${s.pending} unmarked)` : ''}`), h('td', { class: s.pass ? 'good' : 'bad' }, `${Math.round(s.grade * 100)}%`), h('td', {}, r.attempt.breaks?.length || 0), h('td', { class: r.identity === 'ok' ? 'good' : 'bad' }, r.identity),
        h('td', {}, h('button', { onclick: () => { view = { rec, test, r }; rerender(); } }, 'review'), ' ', h('button', { onclick: async () => download(`cancel-CN${r.pin}.txt`, await cancelTGBO(rec, sheet.rtc, r.train, r.pin, s)) }, 'cancel (send marks)'))))),
    h('div', { class: 'row' }, h('button', { onclick: async () => { for (const { r, s } of scored) download(`cancel-CN${r.pin}.txt`, await cancelTGBO(rec, sheet.rtc, r.train, r.pin, s)); } }, 'Cancel all'), h('button', { onclick: () => download(`${rec.title.replace(/\W+/g, '-')}-summary.csv`, csv(test, scored)) }, 'Summary CSV'),
      sheet.superintendent ? h('button', { onclick: async () => download(`report-${rec.title.replace(/\W+/g, '-')}.txt`, await sendReport(sheet.rtc, sheet.superintendent.pub, reportFor(rec, test, scored, sum))) }, `Report to ${sheet.superintendent.name}`) : h('span', { class: 'small' }, 'Drop the superintendent\'s profile on the desk to send reports.')),
    h('h2', {}, 'By area (class mean)'), h('table', {}, sum.byArea.map((a) => h('tr', {}, h('td', {}, a.label), h('td', {}, `${Math.round(a.mean * 100)}%`), h('td', {}, h('div', { class: 'meter' }, h('div', { style: { width: Math.round(a.mean * 100) + '%' } })))))),
    h('h2', {}, 'Hardest items'), h('table', {}, sum.byItem.slice(0, 10).map((i) => h('tr', {}, h('td', {}, i.id), h('td', {}, i.ref.join(', ')), h('td', {}, `${i.correct}/${i.n} fully correct`)))));
};
const reportFor = (rec, test, scored, sum) => ({ tgbo: rec.id, title: rec.title, hash: rec.hash, approved: !!rec.approved, rtc: { name: sheet.rtc.name, pin: sheet.rtc.pin }, issued: rec.issued, sent: Date.now(),
  pass: test.settings.pass, n: sum.n, passed: sum.passed, mean: sum.mean, byArea: sum.byArea.map((a) => ({ id: a.id, label: a.label, mean: a.mean })), hardest: sum.byItem.slice(0, 10).map((i) => ({ id: i.id, ref: i.ref, difficulty: i.difficulty })),
  rows: scored.map(({ r, s }) => ({ pin: r.pin, name: r.name, score: s.score, total: s.total, grade: s.grade, pass: s.pass, pending: s.pending, breaks: r.attempt.breaks?.length || 0, identity: r.identity, areas: s.areas.map((a) => ({ id: a.id, correct: a.correct, total: a.total })), read: s.read })) });
const csv = (test, scored) => { const head = ['pin', 'name', 'score', 'total', 'grade', 'pass', 'breaks', 'identity', ...test.areas.map((a) => a.id), ...test.items.map((i) => i.id)]; const rows = scored.map(({ r, s }) => [r.pin, r.name, s.score, s.total, s.grade.toFixed(3), s.pass, r.attempt.breaks?.length || 0, r.identity, ...s.areas.map((a) => `${a.correct}/${a.total}`), ...s.perItem.map((i) => i.got)]); return [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'); };

const reviewView = () => {
  const { rec, test, r } = view; const marks = marksFor(rec, r.pin); const s = scoreAttempt(test, r.attempt, marks);
  const raw = { items: JSON.parse(atob(rec.tgbo.split('\n\n')[1].replace(/-----END[\s\S]*$/, '').replace(/\s+/g, ''))).items };
  const canvas = h('canvas', { width: 900, height: 600, style: { width: '100%', border: '1px solid #ddd' } });
  const order = r.attempt.events.filter((e) => e[1] === 'show').map((e) => e[2]).filter((v, i, a) => a.indexOf(v) === i);
  let cursor = r.attempt.events.length; const slider = h('input', { type: 'range', min: 0, max: r.attempt.events.length, value: cursor, oninput: (e) => { cursor = Number(e.target.value); paint(); } }); const info = h('p', { class: 'small' });
  const paint = async () => { const st = fold(order, r.attempt.events.slice(0, cursor)); const id = order[st.at]; if (!id) return; const item = await openItem(rec, raw, id); if (item.pairs?.length) item.rights = item.pairs.map((p) => ({ id: p.id, text: p.right })); drawItem(canvas, item, { answer: st.answers[id], images: await imagesFor(item), watermark: 'REVIEW', index: st.at, count: order.length }); const ev = r.attempt.events[cursor - 1]; info.textContent = ev ? `event ${cursor}/${r.attempt.events.length}: ${ev[1]} ${ev[2] ?? ''} at +${Math.round((ev[0] - r.attempt.started) / 1000)}s` : ''; };
  paint();
  return h('div', {}, h('button', { onclick: () => { view = null; rerender(); } }, '← back'), h('div', { class: 'row' }, avatar(sheet.trains.find((t) => t.pin === r.pin) || { name: '?' }, 56), h('h2', {}, `CN ${r.pin} ${r.name} — ${rec.title}: ${s.score}/${s.total} (${Math.round(s.grade * 100)}%)`)),
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
  if (ctx.register) return renderRegister(root, 'rtc', 'RTC', async (p) => { sheet = await newSheet(p); note('new sheet'); go({ screen: 'rtc' }); }, { extractable: true });
  if (ctx.sheetText) { const pw = prompt('Sheet passphrase'); if (pw == null) return go({ screen: 'home' }); try { sheet = await openSheet(ctx.sheetText, pw); pass = pw; note(`opened sheet for ${sheet.rtc.name}`); } catch (e) { return go({ screen: 'home', error: e.message }); } }
  if (!sheet) return mount(root, h('h1', {}, 'RTC'), h('p', {}, 'Your desk is a sheet file, encrypted under your passphrase. Open yours, or register to start one.'), h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => go({ screen: 'rtc', register: true }) }, 'Register and start a sheet'), h('label', { class: 'btn' }, 'Open a sheet', h('input', { type: 'file', style: { display: 'none' }, onchange: async (e) => go({ screen: 'rtc', sheetText: await readFileText(e.target.files[0]) }) }))), h('button', { onclick: () => go({ screen: 'home' }) }, 'Home'));
  for (const k of ['marks', 'assets']) sheet[k] ??= {}; for (const k of ['releases', 'approvals', 'trains', 'tgbos']) sheet[k] ??= [];
  if (ctx.incoming) { await intake(ctx.incoming); ctx.incoming = null; }
  const save = async () => { if (!pass) { pass = prompt('Choose a passphrase for this sheet (you will need it every time)') || ''; if (!pass) return; } const { draft, ...persist } = sheet; for (const t of persist.tgbos) delete t._test; download(`sheet-${sheet.rtc.name.replace(/\W+/g, '-')}.txt`, await saveSheet(persist, pass)); note('sheet saved'); rerender(); };
  const drop = h('div', { class: 'drop', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); takeFiles(e.dataTransfer.files); } },
    'Drop profiles, test sources, images, approvals, releases here', h('br'), h('label', { class: 'btn', style: { marginTop: '8px', display: 'inline-block' } }, 'Choose files', h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: (e) => takeFiles(e.target.files) })));
  const paste = h('textarea', { rows: 3, placeholder: 'Or paste PROFILE / APPROVAL / RELEASE text…' });
  mount(root, h('div', { class: 'bar' }, h('span', { class: 'row' }, avatar(sheet.rtc, 28), ` RTC ${sheet.rtc.name}`), h('span', {}, `${sheet.trains.length} trains · ${sheet.tgbos.length} TGBOs · ${sheet.releases.length} releases`), h('button', { onclick: save }, 'Save sheet')),
    h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, drop), profileCard(sheet.rtc, await profileText(sheet.rtc))),
    h('div', { class: 'row' }, paste, h('button', { onclick: async () => { await intake([{ name: 'pasted', text: paste.value }]); paste.value = ''; rerender(); } }, 'Take')),
    notes.length ? h('ul', { class: 'small' }, notes.map((n) => h('li', { class: n.bad ? 'bad' : '' }, n.m))) : null,
    view ? reviewView() : h('div', {}, h('div', { class: 'tabs' }, ['trains', 'tests', 'releases'].map((t) => h('button', { class: tab === t ? 'on' : '', onclick: () => { tab = t; rerender(); } }, t[0].toUpperCase() + t.slice(1)))), tab === 'trains' ? trainsTab() : tab === 'tests' ? testsTab() : releasesTab()),
    h('p', { class: 'small' }, h('button', { onclick: () => go({ screen: 'home' }) }, 'Home')));
};
