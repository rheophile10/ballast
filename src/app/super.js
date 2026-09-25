// The superintendent's book: RTCs, the test inventory with approvals, and reports across classes.
import { h, mount, download, readFileText } from './h.js';
import { sniff } from '../armor.js';
import { readProfile, profileText } from '../profile.js';
import { parseTest } from '../txt.js';
import { newBook, openBook, saveBook } from '../sheet.js';
import { approveSource, takeReport, readApproval } from '../director.js';
import { sourceHash } from '../profile.js';
import { renderRegister, profileCard, avatar } from './profile-ui.js';

let book = null, tab = 'reports', pass = '', notes = [], root, go;
const note = (m, bad = false) => { notes.unshift({ m, bad }); notes = notes.slice(0, 6); };
const rerender = () => render(root, {}, go);

const intake = async (items) => {
  for (const it of items) {
    try {
      const kind = sniff(it.text);
      if (kind === 'PROFILE') { const p = await readProfile(it.text); if (p.role !== 'rtc') { note(`${p.name} is ${p.role}, not an RTC`, true); continue; } book.trains = book.trains.filter((x) => x.pin !== p.pin); book.trains.push(p); note(`RTC ${p.name}`); tab = 'rtcs'; }
      else if (kind === 'REPORT') { const { teacher, report } = await takeReport(it.text, book.rtc); const rtc = book.trains.find((t) => t.pub === teacher); book.reports = book.reports.filter((x) => x.report.tgbo !== report.tgbo); book.reports.push({ teacher, rtcName: rtc?.name || report.rtc?.name || '?', known: !!rtc, report }); note(`report: ${report.title} from ${rtc?.name || 'unknown RTC'}${rtc ? '' : ' (not on the book)'}`, !rtc); tab = 'reports'; }
      else if (kind) note(`${it.name}: a ${kind} does not belong in the book`, true);
      else { const { test, errors } = await parseTest(it.text); if (errors.length) { note(`${it.name}: ${errors[0]}`, true); continue; } const hash = await sourceHash(it.text); book.sources = book.sources.filter((s) => s.hash !== hash); book.sources.push({ name: it.name, title: test.title, items: test.items.length, hash, source: it.text, approved: null }); note(`source ${test.title} (${test.items.length} items)`); tab = 'inventory'; }
    } catch (e) { note(`${it.name}: ${e.message}`, true); }
  }
};
const takeFiles = async (files) => { const items = []; for (const f of files) items.push({ name: f.name, text: await readFileText(f) }); await intake(items); rerender(); };

const rtcsTab = () => h('table', {}, book.trains.map((t) => h('tr', {}, h('td', {}, avatar(t, 48)), h('td', {}, t.name), h('td', {}, t.pin), h('td', { class: 'small' }, t.pub.slice(0, 12) + '…'))), book.trains.length ? null : h('tr', {}, h('td', { class: 'status' }, 'Drop RTC profiles here.')));
const inventoryTab = () => h('div', {}, h('p', { class: 'small' }, 'Drop test sources. Approve signs the source\'s hash; give the approval file to the RTC, who drops it on their desk. A TGBO built from a byte-identical source then carries the approval.'),
  h('table', {}, h('tr', {}, h('th', {}, 'Test'), h('th', {}, 'Items'), h('th', {}, 'Hash'), h('th', {}, 'Status'), h('th')),
    book.sources.map((s) => h('tr', {}, h('td', {}, s.title), h('td', {}, s.items), h('td', { class: 'small complete' }, s.hash.slice(0, 12)), h('td', { class: s.approved ? 'good' : 'small' }, s.approved ? `approved ${new Date(s.approved).toLocaleDateString()}` : 'not approved'),
      h('td', {}, h('button', { class: s.approved ? '' : 'primary', onclick: async () => { const text = await approveSource(book.rtc, s.source, s.title); s.approved = Date.now(); download(`approval-${s.title.replace(/\W+/g, '-')}.txt`, text); note(`approved ${s.title}`); rerender(); } }, s.approved ? 'approval again' : 'Approve'), ' ', h('button', { onclick: () => download(s.name, s.source) }, 'source'))))));
const reportsTab = () => {
  const reps = book.reports.map((x) => x.report);
  const byPin = {}; for (const x of book.reports) for (const r of x.report.rows) (byPin[r.pin] ??= { name: r.name, rows: [] }).rows.push({ title: x.report.title, grade: r.grade, pass: r.pass, rtc: x.rtcName, when: x.report.sent });
  return h('div', {}, h('h2', {}, 'Administrations'),
    h('table', {}, h('tr', {}, h('th', {}, 'Test'), h('th', {}, 'RTC'), h('th', {}, 'Approved'), h('th', {}, 'Issued'), h('th', {}, 'n'), h('th', {}, 'Passed'), h('th', {}, 'Mean'), h('th', {}, 'Weakest area')),
      book.reports.map((x) => { const r = x.report; const weak = [...r.byArea].sort((a, b) => a.mean - b.mean)[0]; return h('tr', {}, h('td', {}, r.title), h('td', { class: x.known ? '' : 'bad' }, x.rtcName), h('td', { class: r.approved ? 'good' : 'bad' }, r.approved ? 'yes' : 'no'), h('td', { class: 'small' }, new Date(r.issued).toLocaleDateString()), h('td', {}, r.n), h('td', {}, `${r.passed} (${Math.round((100 * r.passed) / (r.n || 1))}%)`), h('td', {}, `${Math.round(r.mean * 100)}%`), h('td', {}, weak ? `${weak.label} ${Math.round(weak.mean * 100)}%` : '')); }),
      reps.length ? null : h('tr', {}, h('td', { class: 'status' }, 'Drop report files from RTCs here.'))),
    h('h2', {}, 'By crew member'), h('table', {}, Object.entries(byPin).sort().map(([pin, v]) => h('tr', {}, h('td', {}, `CN ${pin}`), h('td', {}, v.name), h('td', {}, v.rows.map((r) => h('div', { class: r.pass ? 'good small' : 'bad small' }, `${r.title}: ${Math.round(r.grade * 100)}% (${r.rtc})`)))))),
    reps.length ? h('button', { onclick: () => download('administrations.csv', csvAll()) }, 'All rows as CSV') : null);
};
const csvAll = () => { const rows = [['test', 'rtc', 'approved', 'issued', 'pin', 'name', 'score', 'total', 'grade', 'pass', 'breaks', 'identity']]; for (const x of book.reports) for (const r of x.report.rows) rows.push([x.report.title, x.rtcName, x.report.approved, new Date(x.report.issued).toISOString(), r.pin, r.name, r.score, r.total, r.grade.toFixed(3), r.pass, r.breaks, r.identity]); return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'); };

export const render = async (r, ctx, g) => {
  root = r; go = g;
  if (ctx.register) return renderRegister(root, 'superintendent', 'superintendent', async (p) => { book = await newBook(p); note('new book'); go({ screen: 'super' }); }, { extractable: true });
  if (ctx.bookText) { const pw = prompt('Book passphrase'); if (pw == null) return go({ screen: 'home' }); try { book = await openBook(ctx.bookText, pw); pass = pw; note(`opened book for ${book.rtc.name}`); } catch (e) { return go({ screen: 'home', error: e.message }); } }
  if (!book) return mount(root, h('h1', {}, 'Superintendent'), h('p', {}, 'Your book holds the RTCs, the approved tests, and every report. It is a file encrypted under your passphrase.'), h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => go({ screen: 'super', register: true }) }, 'Register and start a book'), h('label', { class: 'btn' }, 'Open a book', h('input', { type: 'file', style: { display: 'none' }, onchange: async (e) => go({ screen: 'super', bookText: await readFileText(e.target.files[0]) }) }))), h('button', { onclick: () => go({ screen: 'home' }) }, 'Home'));
  for (const k of ['trains', 'sources', 'reports']) book[k] ??= [];
  if (ctx.incoming) { await intake(ctx.incoming); ctx.incoming = null; }
  const save = async () => { if (!pass) { pass = prompt('Choose a passphrase for this book') || ''; if (!pass) return; } download(`book-${book.rtc.name.replace(/\W+/g, '-')}.txt`, await saveBook(book, pass)); note('book saved'); rerender(); };
  const drop = h('div', { class: 'drop', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); takeFiles(e.dataTransfer.files); } }, 'Drop RTC profiles, test sources, reports here', h('br'), h('label', { class: 'btn', style: { marginTop: '8px', display: 'inline-block' } }, 'Choose files', h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: (e) => takeFiles(e.target.files) })));
  const paste = h('textarea', { rows: 3, placeholder: 'Or paste PROFILE / REPORT text…' });
  mount(root, h('div', { class: 'bar' }, h('span', { class: 'row' }, avatar(book.rtc, 28), ` Superintendent ${book.rtc.name}`), h('span', {}, `${book.trains.length} RTCs · ${book.sources.length} tests · ${book.reports.length} reports`), h('button', { onclick: save }, 'Save book')),
    h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, drop), profileCard(book.rtc, await profileText(book.rtc))),
    h('div', { class: 'row' }, paste, h('button', { onclick: async () => { await intake([{ name: 'pasted', text: paste.value }]); paste.value = ''; rerender(); } }, 'Take')),
    notes.length ? h('ul', { class: 'small' }, notes.map((n) => h('li', { class: n.bad ? 'bad' : '' }, n.m))) : null,
    h('div', { class: 'tabs' }, [['reports', 'Reports'], ['inventory', 'Test inventory'], ['rtcs', 'RTCs']].map(([t, l]) => h('button', { class: tab === t ? 'on' : '', onclick: () => { tab = t; rerender(); } }, l))),
    tab === 'reports' ? reportsTab() : tab === 'inventory' ? inventoryTab() : rtcsTab(),
    h('p', { class: 'small' }, h('button', { onclick: () => go({ screen: 'home' }) }, 'Home')));
};
