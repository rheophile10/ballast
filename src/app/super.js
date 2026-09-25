// The superintendent's book: RTCs, the test inventory with approvals, and reports across classes.
import { h, mount, download, readFileText } from './h.js';
import { sniff, blocks } from '../armor.js';
import { auditRelease } from '../release.js';
import { scoreAttempt } from '../score.js';
import { readProfile, profileText, mintProfile } from '../profile.js';
import * as store from './store.js';
import { parseTest } from '../txt.js';
import { newBook, openBook, saveBook } from '../sheet.js';
import { approveSource, takeReport } from '../director.js';
import { sourceHash } from '../profile.js';
import { profileCard, avatar } from './profile-ui.js';
import { announce } from '../embed.js';
import { bookCheck } from './bookcheck.js';

let book = null, tab = 'reports', pass = '', notes = [], root, go;
const note = (m, bad = false) => { notes.unshift({ m, bad }); notes = notes.slice(0, 6); };
const rerender = () => render(root, {}, go);

const intake = async (items) => {
  for (const it of items) {
    try {
      const kind = sniff(it.text);
      if (kind === 'PROFILE') { const p = await readProfile(it.text); if (p.role === 'none') { book.pending = book.pending.filter((x) => x.pub !== p.pub); book.pending.push(p); note(`registration from ${p.name} (${p.pin}) — mint it on the RTCs tab`); tab = 'rtcs'; continue; } if (p.role !== 'rtc') { note(`${p.name} is ${p.role}, not an RTC`, true); continue; } book.trains = book.trains.filter((x) => x.pin !== p.pin); book.trains.push(p); note(`RTC ${p.name}`); tab = 'rtcs'; }
      else if (kind === 'REPORT') { const { teacher, report } = await takeReport(it.text, book.rtc); const rtc = book.trains.find((t) => t.pub === teacher); book.reports = book.reports.filter((x) => x.report.test !== report.test); book.reports.push({ teacher, rtcName: rtc?.name || report.rtc?.name || '?', known: !!rtc, report }); note(`report: ${report.title} from ${rtc?.name || 'unknown RTC'}${rtc ? '' : ' (not on the book)'}`, !rtc); tab = 'reports'; }
      else if (kind === 'RELEASE') { await audit(it.name, it.text); tab = 'reports'; }
      else if (kind) note(`${it.name}: a ${kind} does not belong in the book`, true);
      else { await addSource(it.name, it.text); tab = 'inventory'; }
    } catch (e) { note(`${it.name}: ${e.message}`, true); }
  }
};
/** Re-score a release from its audit copy and the approved source in the inventory; compare with what the RTC reported. */
const audit = async (name, text) => {
  const a = await auditRelease(text, book.rtc);
  const src = book.sources.find((s) => s.hash === a.source); if (!src) throw new Error(`${name}: the source this release was written against (${(a.source || '?').slice(0, 12)}) is not in the inventory`);
  const { test } = await parseTest(src.source); const s = scoreAttempt(test, a.attempt, {});
  const reported = book.reports.flatMap((x) => x.report.rows.map((r) => ({ ...r, rtc: x.rtcName, title: x.report.title }))).find((r) => r.release === a.hash);
  const agrees = reported ? reported.marks?.every(([id, got]) => { const i = s.perItem.find((p) => p.id === id); return i && (i.pending || i.got === got); }) ?? null : null;
  book.audits ??= []; book.audits = book.audits.filter((x) => x.hash !== a.hash); book.audits.push({ hash: a.hash, pin: a.pin, title: src.title, signed: a.signed, when: Date.now(), score: s.score, total: s.total, pending: s.pending, reported: reported ? { grade: reported.grade, score: reported.score, total: reported.total, rtc: reported.rtc, name: reported.name } : null, agrees, items: s.perItem.map((i) => ({ id: i.id, got: i.got, worth: i.worth, pending: i.pending, reported: reported?.marks?.find(([id]) => id === i.id)?.[1] ?? null })) });
  note(`audit ${a.hash.slice(0, 12)} Crew ${a.pin}: re-scored ${s.score}/${s.total}${s.pending ? ` (+${s.pending} short answers unmarked here)` : ''}${reported ? ` · RTC ${reported.rtc} reported ${reported.score}/${reported.total} — ${agrees ? 'AGREES' : 'DIFFERS'}` : ' · no class profile names this release'}`, agrees === false);
};
const takeFiles = async (files) => { const items = []; for (const f of files) { const text = await readFileText(f); const bs = blocks(text); if (bs.length > 1) bs.forEach((b, i) => items.push({ name: `${f.name} #${i + 1}`, text: b })); else items.push({ name: f.name, text }); } await intake(items); rerender(); };

const mint = async (reg) => { const m = await mintProfile(book.rtc, reg, 'rtc'); book.pending = book.pending.filter((x) => x !== reg); book.trains = book.trains.filter((t) => t.pin !== m.pin); book.trains.push(m); download(`profile-RTC-${m.pin}.txt`, await profileText(m)); note(`minted RTC ${m.name} — send them the profile`); rerender(); };
const rtcsTab = () => h('div', {}, book.pending.length ? h('div', { class: 'card' }, h('h2', {}, 'Registrations to mint'), h('table', {}, book.pending.map((r) => h('tr', {}, h('td', {}, avatar(r, 48)), h('td', {}, r.name), h('td', {}, r.pin), h('td', {}, h('button', { class: 'primary', onclick: () => mint(r) }, 'Mint as RTC'), ' ', h('button', { onclick: () => { book.pending = book.pending.filter((x) => x !== r); rerender(); } }, 'discard')))))) : null,
  h('table', {}, book.trains.map((t) => h('tr', {}, h('td', {}, avatar(t, 48)), h('td', {}, t.name), h('td', {}, t.pin), h('td', { class: 'small' }, `since ${t.minted?.start || '?'}`), h('td', { class: 'small' }, t.pub.slice(0, 12) + '…'))), book.trains.length ? null : h('tr', {}, h('td', { class: 'status' }, 'Drop RTC registrations here and mint them.'))));
let editor = { text: '', errors: null, test: null };
const addSource = async (name, text) => { const { test, errors } = await parseTest(text); if (errors.length) { editor = { text, errors, test: null }; return note(`${name}: ${errors[0]}`, true); } const hash = await sourceHash(text); book.sources = book.sources.filter((s) => s.hash !== hash); book.sources.push({ name, title: test.title, items: test.items.length, hash, source: text, approved: null }); editor = { text: '', errors: null, test: null }; note(`source ${test.title} (${test.items.length} items) in the inventory`); };
const authorBox = () => { const ta = h('textarea', { rows: 14, value: editor.text, placeholder: '# Title\ntime: 60m\npass: 90%\nareas: signals "Signals" · switches "Switches"\n\n---\ntype: mc\narea: signals\nref: CROR 27(b)\nQ: …\n*a) right\nb) wrong\n', style: { fontFamily: 'monospace', fontSize: '13px', maxWidth: 'none' }, oninput: (e) => { editor.text = e.target.value; } });
  return h('div', { class: 'card' }, h('h2', {}, 'Write a test'), h('p', { class: 'small' }, 'The source format is in SPEC.md §10. Validate shows problems; Add puts it in the inventory, where you can approve it.'), ta,
    editor.errors?.length ? h('ul', { class: 'bad small' }, editor.errors.map((e) => h('li', {}, e))) : editor.errors ? h('p', { class: 'good small' }, `Valid: ${editor.test.title}, ${editor.test.items.length} items`) : null,
    h('div', { class: 'row' }, h('button', { onclick: async () => { const { test, errors } = await parseTest(editor.text); editor = { ...editor, errors, test: errors.length ? null : test }; rerender(); } }, 'Validate'), h('button', { class: 'primary', onclick: async () => { await addSource('written on the book', editor.text); rerender(); } }, 'Add to inventory'))); };
let checking = null;
const inventoryTab = () => h('div', {}, authorBox(), h('p', { class: 'small' }, 'Or drop test sources. Approve signs the source\'s hash; give the approval file to the RTC, who drops it on their desk. A test built from a byte-identical source then carries the approval.'),
  h('table', {}, h('tr', {}, h('th', {}, 'Test'), h('th', {}, 'Items'), h('th', {}, 'Hash'), h('th', {}, 'Status'), h('th')),
    book.sources.map((s) => h('tr', {}, h('td', {}, s.title), h('td', {}, s.items), h('td', { class: 'small complete' }, s.hash.slice(0, 12)), h('td', { class: s.approved ? 'good' : 'small' }, s.approved ? `approved ${new Date(s.approved).toLocaleDateString()}` : 'not approved'),
      h('td', {}, h('button', { onclick: () => { checking = checking === s.hash ? null : s.hash; rerender(); } }, 'Rulebook check')),
      h('td', {}, h('button', { class: s.approved ? '' : 'primary', onclick: async () => { const text = await approveSource(book.rtc, s.source, s.title); s.approved = Date.now(); download(`approval-${s.title.replace(/\W+/g, '-')}.txt`, text); note(`approved ${s.title}`); rerender(); } }, s.approved ? 'approval again' : 'Approve'), ' ', h('button', { onclick: () => download(s.name, s.source) }, 'source'))))),
  checking && book.sources.find((s) => s.hash === checking) ? bookCheck(book.sources.find((s) => s.hash === checking).source, async (src) => { const old = book.sources.find((s) => s.hash === checking); await addSource(old.name, src); checking = null; note('source linked to the rulebook: new hash, approve it again', true); rerender(); }) : null);
let openReport = null;
const profileView = (x) => { const r = x.report; return h('div', { class: 'card' }, h('button', { onclick: () => { openReport = null; rerender(); } }, '← back'), h('h2', {}, `${r.title} — ${r.class || 'all crew'} — RTC ${x.rtcName}`),
  h('p', { class: 'small' }, `${r.n} crew · ${r.passed} passed · mean ${Math.round(r.mean * 100)}% · ${r.approved ? 'approved test' : 'UNAPPROVED test'}`),
  h('table', {}, h('tr', {}, h('th', {}, 'Crew'), h('th', {}, 'Grade'), h('th', {}, 'Strong'), h('th', {}, 'Weak'), h('th', {}, 'Read'), h('th', {}, 'RTC rating'), h('th', {}, 'RTC appraisal'), h('th', {}, 'Release')),
    r.rows.map((row) => h('tr', {}, h('td', {}, h('b', {}, row.name), h('br'), `Crew ${row.pin}`), h('td', { class: row.pass ? 'good' : 'bad' }, `${Math.round(row.grade * 100)}%`), h('td', { class: 'small' }, (row.strengths || []).join(', ') || '—'), h('td', { class: 'small' }, (row.weaknesses || []).join(', ') || '—'), h('td', { class: 'small' }, (row.read || []).slice(0, 4).map((z) => z.ref).join(', ')), h('td', {}, row.rating ? '★'.repeat(row.rating) : '—'), h('td', { class: 'small', style: { maxWidth: '320px' } }, row.note || '—'), h('td', { class: 'complete small' }, (row.release || '').slice(0, 12), row.signed === false ? ' unsigned!' : '', row.late ? ' late' : ''))))); };
const reportsTab = () => {
  if (openReport) return profileView(openReport);
  const reps = book.reports.map((x) => x.report);
  const byPin = {}; for (const x of book.reports) for (const r of x.report.rows) (byPin[r.pin] ??= { name: r.name, rows: [] }).rows.push({ title: x.report.title, grade: r.grade, pass: r.pass, rtc: x.rtcName, when: x.report.sent, rating: r.rating, weak: r.weaknesses });
  return h('div', {}, h('h2', {}, 'Administrations'),
    h('table', {}, h('tr', {}, h('th', {}, 'Test'), h('th', {}, 'RTC'), h('th', {}, 'Approved'), h('th', {}, 'Issued'), h('th', {}, 'n'), h('th', {}, 'Passed'), h('th', {}, 'Mean'), h('th', {}, 'Weakest area')),
      book.reports.map((x) => { const r = x.report; const weak = [...r.byArea].sort((a, b) => a.mean - b.mean)[0]; return h('tr', {}, h('td', {}, h('button', { onclick: () => { openReport = x; rerender(); } }, r.title), h('div', { class: 'small' }, r.class || '')), h('td', { class: x.known ? '' : 'bad' }, x.rtcName), h('td', { class: r.approved ? 'good' : 'bad' }, r.approved ? 'yes' : 'no'), h('td', { class: 'small' }, new Date(r.issued).toLocaleDateString()), h('td', {}, r.n), h('td', {}, `${r.passed} (${Math.round((100 * r.passed) / (r.n || 1))}%)`), h('td', {}, `${Math.round(r.mean * 100)}%`), h('td', {}, weak ? `${weak.label} ${Math.round(weak.mean * 100)}%` : '')); }),
      reps.length ? null : h('tr', {}, h('td', { class: 'status' }, 'Drop report files from RTCs here.'))),
    h('h2', {}, 'By crew member'), h('table', {}, Object.entries(byPin).sort().map(([pin, v]) => h('tr', {}, h('td', {}, `Crew ${pin}`), h('td', {}, v.name), h('td', {}, v.rows.map((r) => h('div', { class: r.pass ? 'good small' : 'bad small' }, `${r.title}: ${Math.round(r.grade * 100)}% (${r.rtc})${r.rating ? ' ' + '★'.repeat(r.rating) : ''}${r.weak?.length ? ' · weak: ' + r.weak.join(', ') : ''}`)))))),
    reps.length ? h('button', { onclick: () => download('administrations.csv', csvAll()) }, 'All rows as CSV') : null,
    h('h2', {}, 'Audits'), h('p', { class: 'small' }, 'A crew member who doubts their marks sends you their release file. Drop it here: it carries a copy sealed to you, and you re-score it from the approved source in the inventory and compare with what the RTC reported for that release hash.'),
    (book.audits || []).length ? h('table', {}, h('tr', {}, h('th', {}, 'Release'), h('th', {}, 'Crew'), h('th', {}, 'Test'), h('th', {}, 'Re-scored'), h('th', {}, 'RTC reported'), h('th', {}, 'Compare')),
      book.audits.map((a) => h('tr', {}, h('td', { class: 'complete small' }, a.hash.slice(0, 16), a.signed === false ? h('span', { class: 'bad' }, ' bad signature') : ''), h('td', {}, `Crew ${a.pin}`), h('td', {}, a.title), h('td', {}, `${a.score}/${a.total}${a.pending ? ` (+${a.pending} short)` : ''}`), h('td', {}, a.reported ? `${a.reported.score}/${a.reported.total} (${a.reported.rtc})` : '—'), h('td', { class: a.agrees === true ? 'good' : a.agrees === false ? 'bad' : 'small' }, a.agrees === true ? 'agrees' : a.agrees === false ? 'DIFFERS' : 'no report names it')))) : null);
};
const csvAll = () => { const rows = [['test', 'class', 'rtc', 'approved', 'issued', 'pin', 'name', 'score', 'total', 'grade', 'pass', 'breaks', 'identity', 'strengths', 'weaknesses', 'rating', 'appraisal']]; for (const x of book.reports) for (const r of x.report.rows) rows.push([x.report.title, x.report.class || '', x.rtcName, x.report.approved, new Date(x.report.issued).toISOString(), r.pin, r.name, r.score, r.total, r.grade.toFixed(3), r.pass, r.breaks, r.identity, (r.strengths || []).join('; '), (r.weaknesses || []).join('; '), r.rating || '', r.note || '']); return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'); };

export const render = async (r, ctx, g) => {
  root = r; go = g;
  if (ctx.fresh) { book = await newBook(await store.get('profile')); note('new book'); }
  if (ctx.bookText) { const pw = prompt('Book passphrase'); if (pw == null) return go({ screen: 'home' }); try { book = await openBook(ctx.bookText, pw); pass = pw; note(`opened book for ${book.rtc.name}`); } catch (e) { return go({ screen: 'home', error: e.message }); } }
  if (!book) { const p = await store.get('profile'); return mount(root, h('h1', {}, 'Superintendent'), profileCard(p, await profileText(p)), h('p', {}, 'Your book holds the RTCs, the approved tests, and every report. It is a file encrypted under your passphrase.'), h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => go({ screen: 'super', fresh: true }) }, 'Start a book'), h('label', { class: 'btn' }, 'Open a book', h('input', { type: 'file', style: { display: 'none' }, onchange: async (e) => go({ screen: 'super', bookText: await readFileText(e.target.files[0]) }) })))); }
  for (const k of ['trains', 'sources', 'reports', 'pending', 'audits']) book[k] ??= [];
  announce('book', book.rtc);
  if (ctx.incoming) { await intake(ctx.incoming); ctx.incoming = null; }
  const save = async () => { if (!pass) { pass = prompt('Choose a passphrase for this book') || ''; if (!pass) return; } download(`book-${book.rtc.name.replace(/\W+/g, '-')}.txt`, await saveBook(book, pass)); note('book saved'); rerender(); };
  const drop = h('div', { class: 'drop', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); takeFiles(e.dataTransfer.files); } }, 'Drop RTC registrations, test sources, class profiles, releases to audit here', h('br'), h('label', { class: 'btn', style: { marginTop: '8px', display: 'inline-block' } }, 'Choose files', h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: (e) => takeFiles(e.target.files) })));
  const paste = h('textarea', { rows: 3, placeholder: 'Or paste PROFILE / REPORT text…' });
  mount(root, h('div', { class: 'bar' }, h('span', { class: 'row' }, avatar(book.rtc, 28), ` Superintendent ${book.rtc.name}`), h('span', {}, `${book.trains.length} RTCs · ${book.sources.length} tests · ${book.reports.length} reports`), h('button', { onclick: save }, 'Save book')),
    h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, drop), profileCard(book.rtc, await profileText(book.rtc))),
    h('div', { class: 'row' }, paste, h('button', { onclick: async () => { await intake([{ name: 'pasted', text: paste.value }]); paste.value = ''; rerender(); } }, 'Take')),
    notes.length ? h('ul', { class: 'small' }, notes.map((n) => h('li', { class: n.bad ? 'bad' : '' }, n.m))) : null,
    h('div', { class: 'tabs' }, [['reports', 'Reports'], ['inventory', 'Test inventory'], ['rtcs', 'RTCs']].map(([t, l]) => h('button', { class: tab === t ? 'on' : '', onclick: () => { tab = t; rerender(); } }, l))),
    tab === 'reports' ? reportsTab() : tab === 'inventory' ? inventoryTab() : rtcsTab(),
    h('p', { class: 'small' }, h('button', { onclick: () => { book = null; go({ screen: 'home' }); } }, 'Close book')));
};
