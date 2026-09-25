// The RTC's desk: the sheet, the trains, the TGBOs, the releases, the cancellations.
import { h, mount, download, readFileText, readFileBytes, fmtTime } from './h.js';
import { sniff, dearmor } from '../armor.js';
import { readCrew, badgeRead } from '../crew.js';
import { parseTest } from '../txt.js';
import { issueTGBO, openItem } from '../tgbo.js';
import { takeRelease } from '../release.js';
import { scoreAttempt, summarize } from '../score.js';
import { cancelTGBO } from '../cancel.js';
import { newSheet, openSheet, saveSheet } from '../sheet.js';
import { fold } from './attempt.js';
import { drawItem, imagesFor } from './draw.js';
import { b64 } from '../bytes.js';

let sheet = null, tab = 'trains', pass = '', notes = [];
const note = (m, bad = false) => { notes.unshift({ m, bad, t: Date.now() }); notes = notes.slice(0, 6); };
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

// ---------- intake: anything dropped on the desk
const intake = async (items) => {
  for (const it of items) {
    try {
      if (it.error) { note(`${it.name}: ${it.error}`, true); continue; }
      if (it.asset) { const bytes = await readFileBytes(it.asset); (sheet.assets ??= {})[it.name] = { mime: it.asset.type || 'image/jpeg', b64: b64(bytes) }; note(`asset ${it.name} (${Math.round(bytes.length / 1024)} KB)`); continue; }
      if (it.source) { const { test, errors } = await parseTest(it.text); if (errors.length) { note(`${it.name}: ${errors.length} problem(s) — ${errors[0]}`, true); sheet.draft = { name: it.name, source: it.text, errors }; } else { sheet.draft = { name: it.name, source: it.text, test, errors: [] }; note(`test source ${it.name}: ${test.items.length} items`); } tab = 'tests'; continue; }
      const kind = sniff(it.text);
      if (kind === 'CREW') { const c = await readCrew(it.text); const i = sheet.trains.findIndex((t) => t.pin === c.pin); if (i >= 0 && sheet.trains[i].pub !== c.pub) note(`CN ${c.pin} re-registered with a new key (${c.name}); replaced`, true); if (i >= 0) sheet.trains[i] = c; else sheet.trains.push(c); note(`crew CN ${c.pin} ${c.name}`); tab = 'trains'; }
      else if (kind === 'RELEASE') { const { body } = await dearmor(it.text); const rec = sheet.tgbos.find((t) => t.id === body.tgbo); if (!rec) throw new Error('release is for a TGBO not on this sheet'); const r = await takeRelease(it.text, sheet.rtc, rec); const onSheet = sheet.trains.find((t) => t.pin === r.pin); const identity = onSheet && onSheet.pub === r.train ? 'ok' : 'KEY MISMATCH'; sheet.releases = sheet.releases.filter((x) => !(x.tgbo === rec.id && x.pin === r.pin)); sheet.releases.push({ tgbo: rec.id, pin: r.pin, train: r.train, identity, attempt: r.attempt, name: onSheet?.name || '?' }); note(`release CN ${r.pin} for ${rec.title}${identity !== 'ok' ? ' — KEY MISMATCH' : ''}`, identity !== 'ok'); tab = 'releases'; }
      else if (kind === 'SHEET') note('a sheet is already open; use the home page to open another', true);
      else if (kind === 'TGBO') note('that is a TGBO you issued; the RTC does not copy TGBOs', true);
      else note(`${it.name}: not recognised`, true);
    } catch (e) { note(`${it.name}: ${e.message}`, true); }
  }
};

// ---------- tabs
const trainsTab = () => h('div', {},
  h('p', { class: 'small' }, 'Drop badges (PNG) or pasted CREW text on the desk. Each train appears once per PIN; a new key for a known PIN replaces the old one and is noted.'),
  h('table', {}, h('tr', {}, h('th', {}, 'PIN'), h('th', {}, 'Name'), h('th', {}, 'Key')),
    sheet.trains.sort((a, b) => a.pin.localeCompare(b.pin)).map((t) => h('tr', {}, h('td', {}, `CN ${t.pin}`), h('td', {}, t.name), h('td', { class: 'small' }, t.pub.slice(0, 12) + '…', ' ', h('button', { onclick: () => { sheet.trains = sheet.trains.filter((x) => x !== t); rerender(); } }, 'remove'))))),
  sheet.trains.length ? null : h('p', { class: 'status' }, 'No trains yet.'));

const testsTab = () => {
  const d = sheet.draft;
  const issue = async () => {
    if (!d?.test) return;
    const missing = d.test.items.flatMap((i) => i.img.map((im) => im.name)).filter((n) => !(sheet.assets || {})[n]);
    if (missing.length) return note(`missing assets: ${[...new Set(missing)].join(', ')} — drop them on the desk`, true), rerender();
    if (!sheet.trains.length) return note('no trains on the sheet', true), rerender();
    const { text, record } = await issueTGBO(d.test, sheet.rtc, sheet.trains, sheet.assets || {}, sheet.rtc.name);
    record.source = d.source; record.tgbo = text; record.issued = Date.now(); record.trains = sheet.trains.map((t) => t.pin);
    sheet.tgbos.push(record); download(`${d.test.title.replace(/\W+/g, '-')}.tie`, text); note(`issued ${record.title} to ${sheet.trains.length} train(s) — complete ${record.hash.slice(0, 4).toUpperCase()}`); rerender();
  };
  return h('div', {},
    h('p', { class: 'small' }, 'Drop a test source (.txt) and any images it names. Issue writes one TGBO for every train on the sheet.'),
    d ? h('div', { class: 'card' }, h('b', {}, d.name), d.errors.length ? h('ul', { class: 'bad' }, d.errors.map((e) => h('li', {}, e))) : h('p', {}, `${d.test.title} · ${d.test.items.length} items · ${fmtTime(d.test.settings.time)} · pass ${Math.round(d.test.settings.pass * 100)}% · areas: ${d.test.areas.map((a) => a.id).join(', ') || 'none'}`),
      d.errors.length ? null : h('button', { class: 'primary', onclick: issue }, `Issue TGBO to ${sheet.trains.length} train(s)`)) : h('p', { class: 'status' }, 'No test source loaded.'),
    h('h2', {}, 'Issued'),
    h('table', {}, sheet.tgbos.map((t) => h('tr', {}, h('td', {}, t.title), h('td', { class: 'small' }, new Date(t.issued).toLocaleString()), h('td', {}, `${t.trains?.length ?? '?'} trains`), h('td', { class: 'complete small' }, t.hash.slice(0, 4).toUpperCase()), h('td', {}, h('button', { onclick: () => download(`${t.title.replace(/\W+/g, '-')}.tie`, t.tgbo) }, 'download again'))))),
    h('h2', {}, 'Assets on the desk'), h('p', { class: 'small' }, Object.keys(sheet.assets || {}).join(', ') || 'none'));
};

const releasesTab = () => {
  const groups = sheet.tgbos.map((rec) => {
    const rel = sheet.releases.filter((r) => r.tgbo === rec.id);
    return { rec, rel };
  }).filter((g) => g.rel.length);
  if (!groups.length) return h('p', { class: 'status' }, 'No releases yet. Drop .spike files or pasted RELEASE text on the desk.');
  return h('div', {}, groups.map(({ rec, rel }) => {
    const test = rec._test; // parsed lazily below
    return h('div', { class: 'card' }, h('h2', {}, rec.title),
      test ? releaseTable(rec, test, rel) : h('button', { onclick: async () => { rec._test = (await parseTest(rec.source)).test; rerender(); } }, 'Score'));
  }));
};
const releaseTable = (rec, test, rel) => {
  const marks = (pin) => (sheet.marks[`${rec.id}:${pin}`] ??= {});
  const scored = rel.map((r) => ({ r, s: scoreAttempt(test, r.attempt, marks(r.pin)) }));
  const sum = summarize(test, scored.map((x) => x.s));
  const cancelAll = async () => { for (const { r, s } of scored) download(`cancel-CN${r.pin}.plate`, await cancelTGBO(rec, sheet.rtc, r.train, r.pin, s)); };
  return h('div', {},
    h('p', {}, `${sum.n} released · ${sum.passed} passed · mean ${Math.round(sum.mean * 100)}%`),
    h('table', {}, h('tr', {}, h('th', {}, 'Train'), h('th', {}, 'Name'), h('th', {}, 'Score'), h('th', {}, 'Grade'), h('th', {}, 'Breaks'), h('th', {}, 'Identity'), h('th', {})),
      scored.map(({ r, s }) => h('tr', {}, h('td', {}, `CN ${r.pin}`), h('td', {}, r.name), h('td', {}, `${s.score}/${s.total}${s.pending ? ` (+${s.pending} unmarked)` : ''}`), h('td', { class: s.pass ? 'good' : 'bad' }, `${Math.round(s.grade * 100)}%`), h('td', {}, r.attempt.breaks?.length || 0), h('td', { class: r.identity === 'ok' ? 'good' : 'bad' }, r.identity),
        h('td', {}, h('button', { onclick: () => { view = { rec, test, r }; rerender(); } }, 'review'), ' ', h('button', { onclick: async () => download(`cancel-CN${r.pin}.plate`, await cancelTGBO(rec, sheet.rtc, r.train, r.pin, s)) }, 'cancel (send marks)'))))),
    h('div', { class: 'row' }, h('button', { onclick: cancelAll }, 'Cancel all (download every .plate)'), h('button', { onclick: () => download(`${rec.title.replace(/\W+/g, '-')}-summary.csv`, csv(test, scored)) }, 'Summary CSV')),
    h('h2', {}, 'By area (class mean)'), h('table', {}, sum.byArea.map((a) => h('tr', {}, h('td', {}, a.label), h('td', {}, `${Math.round(a.mean * 100)}%`), h('td', {}, h('div', { class: 'meter' }, h('div', { style: { width: Math.round(a.mean * 100) + '%' } })))))),
    h('h2', {}, 'Hardest items'), h('table', {}, sum.byItem.slice(0, 10).map((i) => h('tr', {}, h('td', {}, i.id), h('td', {}, i.ref.join(', ')), h('td', {}, `${i.correct}/${i.n} fully correct`)))));
};
const csv = (test, scored) => {
  const head = ['pin', 'name', 'score', 'total', 'grade', 'pass', 'breaks', 'identity', ...test.areas.map((a) => a.id), ...test.items.map((i) => i.id)];
  const rows = scored.map(({ r, s }) => [r.pin, r.name, s.score, s.total, s.grade.toFixed(3), s.pass, r.attempt.breaks?.length || 0, r.identity, ...s.areas.map((a) => `${a.correct}/${a.total}`), ...s.perItem.map((i) => i.got)]);
  return [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
};

// ---------- review one release: answers, marking, playback
let view = null;
const reviewView = () => {
  const { rec, test, r } = view; const marks = (sheet.marks[`${rec.id}:${r.pin}`] ??= {});
  const s = scoreAttempt(test, r.attempt, marks);
  const raw = { items: JSON.parse(atob(rec.tgbo.split('\n\n')[1].replace(/-----END[\s\S]*$/, '').replace(/\s+/g, ''))).items };
  const canvas = h('canvas', { width: 900, height: 700, style: { width: '100%', border: '1px solid #ddd' } });
  const order = r.attempt.events.filter((e) => e[1] === 'show').map((e) => e[2]).filter((v, i, a) => a.indexOf(v) === i);
  let cursor = r.attempt.events.length; const slider = h('input', { type: 'range', min: 0, max: r.attempt.events.length, value: cursor, oninput: (e) => { cursor = Number(e.target.value); paint(); } });
  const info = h('p', { class: 'small' });
  const paint = async () => {
    const st = fold(order, r.attempt.events.slice(0, cursor)); const id = order[st.at]; if (!id) return;
    const item = await openItem(rec, raw, id); if (item.pairs?.length) item.rights = item.pairs.map((p) => ({ id: p.id, text: p.right }));
    drawItem(canvas, item, { answer: st.answers[id], images: await imagesFor(item), watermark: 'REVIEW', index: st.at, count: order.length });
    const ev = r.attempt.events[cursor - 1]; info.textContent = ev ? `event ${cursor}/${r.attempt.events.length}: ${ev[1]} ${ev[2] ?? ''} at +${Math.round((ev[0] - r.attempt.started) / 1000)}s` : '';
  };
  paint();
  return h('div', {}, h('button', { onclick: () => { view = null; rerender(); } }, '← back'), h('h2', {}, `CN ${r.pin} ${r.name} — ${rec.title}: ${s.score}/${s.total} (${Math.round(s.grade * 100)}%)`),
    h('h2', {}, 'Answers'),
    h('table', {}, test.items.map((it) => { const a = r.attempt.answers[it.id]; const pi = s.perItem.find((x) => x.id === it.id);
      return h('tr', {}, h('td', { class: 'small' }, it.id, h('br'), it.ref.join(', ')), h('td', {}, it.prompt.split('\n')[0].slice(0, 90)),
        h('td', {}, it.type === 'short' ? h('div', {}, h('div', {}, h('b', {}, 'answer: '), a || '—'), h('div', { class: 'small' }, h('b', {}, 'model: '), it.answer), h('label', {}, 'mark ', h('input', { type: 'number', min: 0, max: it.worth, step: 0.5, value: marks[it.id] ?? '', style: { width: '70px' }, onchange: (e) => { marks[it.id] = Number(e.target.value); rerender(); } }))) : it.type === 'match' ? Object.entries(a || {}).map(([l, rr]) => `${l}→${rr} `).join('') || '—' : `${a ?? '—'} (key ${it.key})`),
        h('td', { class: pi.pending ? 'status' : pi.got === pi.worth ? 'good' : 'bad' }, pi.pending ? 'unmarked' : `${pi.got}/${pi.worth}`)); })),
    h('h2', {}, 'Breaks'), r.attempt.breaks?.length ? h('ul', {}, r.attempt.breaks.map((b) => h('li', {}, `${b.why} for ${Math.round(b.ms / 1000)} s at +${Math.round((b.at - r.attempt.started) / 1000)} s`))) : h('p', {}, 'none'),
    h('h2', {}, 'Playback'), slider, info, canvas);
};

// ---------- the desk
let root, go;
const rerender = () => render(root, {}, go);
export const render = async (r, ctx, g) => {
  root = r; go = g;
  if (ctx.fresh && !sheet) { const name = prompt('RTC name or initials (goes on every Complete)') || 'RTC'; sheet = await newSheet(name); note('new sheet'); }
  if (ctx.sheetText) {
    const pw = prompt('Sheet passphrase'); if (pw == null) return go({ screen: 'home' });
    try { sheet = await openSheet(ctx.sheetText, pw); pass = pw; note(`opened sheet for ${sheet.rtc.name}`); } catch (e) { return go({ screen: 'home', error: e.message }); }
  }
  if (!sheet) return mount(root, h('h1', {}, 'RTC'), h('p', {}, 'Open a sheet (.bed) from the home page, or start a new one.'), h('button', { onclick: () => go({ screen: 'rtc', fresh: true }) }, 'New sheet'), h('button', { onclick: () => go({ screen: 'home' }) }, 'Home'));
  sheet.marks ??= {}; sheet.releases ??= []; sheet.assets ??= {};
  if (ctx.incoming) { await intake(ctx.incoming); ctx.incoming = null; }
  const save = async () => { if (!pass) { pass = prompt('Choose a passphrase for this sheet (you will need it every time)') || ''; if (!pass) return; } const { draft, ...persist } = sheet; for (const t of persist.tgbos) delete t._test; download(`${sheet.rtc.name.replace(/\W+/g, '-')}.bed`, await saveSheet(persist, pass)); note('sheet saved'); rerender(); };
  const takeFiles = async (files) => { const items = []; for (const f of files) { if (/\.png$/i.test(f.name)) { const t = badgeRead(await readFileBytes(f)); items.push(t ? { name: f.name, text: t } : { name: f.name, asset: f }); } else if (/\.(jpe?g|gif|webp)$/i.test(f.name)) items.push({ name: f.name, asset: f }); else { const text = await readFileText(f); items.push(sniff(text) ? { name: f.name, text } : { name: f.name, text, source: true }); } } await intake(items); rerender(); };
  const drop = h('div', { class: 'drop', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); takeFiles(e.dataTransfer.files); } },
    'Drop badges, test sources, images, releases here', h('br'), h('label', { class: 'btn', style: { marginTop: '8px', display: 'inline-block' } }, 'Choose files', h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: (e) => takeFiles(e.target.files) })));
  const paste = h('textarea', { rows: 3, placeholder: 'Or paste CREW / RELEASE text…' });
  mount(root,
    h('div', { class: 'bar' }, h('span', {}, `RTC ${sheet.rtc.name}`), h('span', {}, `${sheet.trains.length} trains · ${sheet.tgbos.length} TGBOs · ${sheet.releases.length} releases`), h('button', { onclick: save }, 'Save sheet (.bed)')),
    h('div', { class: 'row' }, drop), h('div', { class: 'row' }, paste, h('button', { onclick: async () => { await intake([{ name: 'pasted', text: paste.value }]); paste.value = ''; rerender(); } }, 'Take')),
    notes.length ? h('ul', { class: 'small' }, notes.map((n) => h('li', { class: n.bad ? 'bad' : '' }, n.m))) : null,
    view ? reviewView() : h('div', {},
      h('div', { class: 'tabs' }, ['trains', 'tests', 'releases'].map((t) => h('button', { class: tab === t ? 'on' : '', onclick: () => { tab = t; rerender(); } }, t[0].toUpperCase() + t.slice(1)))),
      tab === 'trains' ? trainsTab() : tab === 'tests' ? testsTab() : releasesTab()),
    h('p', { class: 'small' }, h('button', { onclick: () => go({ screen: 'home' }) }, 'Home')));
};
