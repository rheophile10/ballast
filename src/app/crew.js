// The crew's side: practice, copy a test, work it, release, read a cancellation.
import { h, mount, download, fmtTime, hhmm } from './h.js';
import * as store from './store.js';
import { profileText } from '../profile.js';
import { copyTest } from '../testfile.js';
import { giveRelease } from '../release.js';
import { readCancel } from '../cancel.js';
import { dearmor } from '../armor.js';
import { parseTest, publicItem } from '../txt.js';
import { scoreAttempt } from '../score.js';
import { fold, toRelease } from './attempt.js';
import { drawItem, imagesFor, forget } from './draw.js';
import { svgFor } from '../svg.js';
import { shuffled } from '../shuffle.js';
import { profileCard, avatar } from './profile-ui.js';

const now = () => Date.now();
export const me = async () => (await store.get('profile')) || null;

// ---------- home: a checklist
export const renderHome = async (root, go, dropBox) => {
  const p = await me(); const log = (await store.get('crewlog')) || {};
  const step = (n, label, done, detail) => h('li', { class: done ? 'done' : 'next' }, h('b', {}, `${n}. ${label}`), detail ? h('div', { class: 'small' }, detail) : null);
  mount(root,
    h('h1', {}, 'Crew'),
    profileCard(p, await profileText(p)),
    h('ol', { class: 'steps' },
      step(1, 'Copy the test the RTC sends you', !!log.copied, log.copied ? `${log.copied.title} at ${log.copied.when}` : 'Drop or paste the test below.'),
      step(2, 'Release', !!log.released, log.released ? `${log.released.title} at ${log.released.when}` : 'Fullscreen, one item at a time, then Release track.'),
      step(3, 'Read your cancellation', !!log.cancelled, log.cancelled ? `${log.cancelled.grade}% on ${log.cancelled.title}${log.cancelled.match === true ? ' · marks compare with your release' : log.cancelled.match === false ? ' · DOES NOT COMPARE with your release' : ''}` : 'Drop the cancellation the RTC sends back to see your marks and what to read.')),
    log.released?.hash ? h('p', { class: 'small' }, 'Your last release: ', h('span', { class: 'complete' }, log.released.hash), ' — the cancellation must name this hash.') : null,
    dropBox('Drop or paste a test, or a cancellation'),
    h('h2', {}, 'Practice'), h('p', { class: 'small' }, 'Drop a test source (.txt, with answers) here to run the same drill on it — repeat, fullscreen, one item at a time — and mark yourself. Not for record.'),
    practiceBox(go));
};


// ---------- copy a test (or start the practice)
const clearanceSvg = (tgbo, p) => svgFor(`form clearance kind="Clearance" no=${tgbo.clearance} to="Crew ${p.pin}" proceed="item 1 → item ${tgbo.order.length}" until="repeated back" call="before ${fmtTime(tgbo.settings.time)}" complete="${hhmm()}" rtc="${tgbo.rtcName || ''}"`);
export const renderCopy = async (root, { text, practice, source }, go) => {
  const p = await me();
  if (!p) return mount(root, h('h1', {}, 'Not registered'), h('p', {}, 'Register first; a test is addressed to your key.'));
  let tgbo;
  try { tgbo = practice ? await practiceTest(p, source) : await copyTest(text, p, p.pin); }
  catch (e) { return mount(root, h('h1', {}, 'Cannot copy this test'), h('p', { class: 'bad' }, e.message), h('button', { onclick: () => go({ screen: 'home' }) }, 'Back')); }
  const saved = practice ? null : await store.get('attempt:' + tgbo.id);
  const repeat = h('input', { placeholder: 'Repeat (4 characters)', maxlength: 4, autocomplete: 'off', style: { textTransform: 'uppercase', maxWidth: '240px' } });
  const status = h('p', { class: 'status' });
  const form = h('img', { src: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clearanceSvg(tgbo, p)))), style: { maxWidth: '100%' }, alt: 'clearance' });
  const start = async (e) => {
    e.preventDefault();
    if (repeat.value.trim().toUpperCase() !== tgbo.complete) { status.textContent = 'Does not compare. Read it again and repeat.'; return; }
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { status.textContent = 'Fullscreen is required.'; return; }
    try { await navigator.keyboard?.lock?.(); } catch { /* not everywhere */ }
    const events = saved?.events?.length ? saved.events : [[now(), 'copy', tgbo.complete]];
    if (!practice) await store.set('crewlog', { ...((await store.get('crewlog')) || {}), copied: { title: tgbo.title, when: hhmm() } });
    go({ screen: 'work', tgbo, p, events, practice });
  };
  mount(root, h('h1', {}, tgbo.title), tgbo.approval ? h('p', { class: 'small good' }, `Approved by ${tgbo.approval.name}`) : null,
    h('div', { class: 'card' }, form,
      h('p', {}, `Clearance No. ${tgbo.clearance} to Crew ${p.pin} · ${tgbo.order.length} items · ${fmtTime(tgbo.settings.time)} · pass ${Math.round(tgbo.settings.pass * 100)}%`),
      tgbo.window ? h('p', { class: 'small' }, `Window: ${new Date(tgbo.window.from).toLocaleString()} → ${new Date(tgbo.window.until).toLocaleString()}. Outside it the clearance does not open, and a late release is flagged to the RTC.`) : null,
      h('p', {}, 'Rule 136 — copy as transmitted, then repeat back:'), h('p', { class: 'complete' }, `Complete ${hhmm()} · RTC ${tgbo.rtcName || ''} · `, h('b', {}, tgbo.complete)),
      saved?.events?.length ? h('p', { class: 'status' }, `An attempt in progress was found (${Object.keys(fold(tgbo.order, saved.events).answers).length} answered). It will resume.`) : null,
      h('form', { onsubmit: start, class: 'row' }, repeat, h('button', { type: 'submit', class: 'primary' }, 'Repeat and enter fullscreen')), status,
      h('p', { class: 'small' }, 'From here on: one item at a time, fullscreen, no copying. Leaving fullscreen or the tab is recorded.')));
};

const practiceBox = (go) => { const ta = h('textarea', { rows: 3, placeholder: 'Paste a test source for practice…' }); return h('div', { class: 'row' }, ta, h('button', { onclick: () => ta.value.trim() && go({ screen: 'practice', source: ta.value }) }, 'Practice'), h('label', { class: 'btn' }, 'Choose a source', h('input', { type: 'file', style: { display: 'none' }, onchange: async (e) => go({ screen: 'practice', source: await e.target.files[0].text() }) }))); };

/** The practice test, built locally: same reader shape as a real test file, no crypto, answers kept for self-marking. */
const practiceTest = async (p, source) => {
  const { test, errors } = await parseTest(source); if (errors.length) throw new Error(errors[0]);
  const sid = 'practice:' + p.pin;
  const order = shuffled(test.items.map((i) => i.id), sid);
  return { id: 'practice', title: test.title + ' (practice)', settings: test.settings, areas: test.areas, rtcName: 'BALLAST', clearance: 0, sid, order, complete: 'PRAC', test,
    item: async (id) => { const it = publicItem(test.items.find((i) => i.id === id)); if (test.settings.shuffleOptions && it.options.length) it.options = shuffled(it.options, sid + id); if (it.pairs.length) it.rights = shuffled(it.pairs.map((x) => ({ id: x.id, text: x.right })), sid + id + 'r'); return it; } };
};

// ---------- work the test
export const renderWork = async (root, { tgbo, p, events, practice }, go) => {
  forget();
  const log = (kind, a, b) => { events.push([now(), kind, a, b]); if (!practice) store.set('attempt:' + tgbo.id, { events }); };
  const state = () => fold(tgbo.order, events);
  const canvas = h('canvas', { width: 900, height: 360, tabindex: 0 });
  const timer = h('span', { class: 'timer' }); const status = h('p', { class: 'status' });
  const answerBox = h('textarea', { rows: 4, placeholder: 'Your answer', style: { display: 'none' } });
  let item = null, hits = [], pick = null, images = [];
  const watermark = `Crew ${p.pin} ${p.name} ${hhmm()}`;
  const deadline = () => (state().started || now()) + tgbo.settings.time * 1000;
  const tick = () => { const left = Math.max(0, Math.ceil((deadline() - now()) / 1000)); timer.textContent = fmtTime(left); if (left <= 0 && !state().finished) submit('time'); };
  const iv = setInterval(tick, 500);
  const draw = () => {
    const s = state(); const opts = { answer: s.answers[item.id], pick, images, watermark, index: s.at, count: tgbo.order.length };
    canvas.height = Math.max(360, drawItem(canvas, item, opts).height); hits = drawItem(canvas, item, opts).hits;
    canvas.dataset.hits = JSON.stringify(hits.map(({ x, y, w, h: hh, kind, id }) => ({ x, y, w, h: hh, kind, id: typeof id === 'string' ? id : 'img' })));
    answerBox.style.display = item.type === 'short' ? 'block' : 'none'; if (item.type === 'short') answerBox.value = s.answers[item.id] || '';
  };
  const show = async (i) => { const id = tgbo.order[Math.max(0, Math.min(tgbo.order.length - 1, i))]; item = await tgbo.item(id); images = await imagesFor(item); pick = null; log('show', id); draw(); canvas.focus(); };
  const click = (e) => {
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * (canvas.width / r.width), y = (e.clientY - r.top) * (canvas.height / r.height);
    const hit = hits.find((t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h); if (!hit) return;
    if (hit.kind === 'option') log('answer', item.id, hit.id);
    else if (hit.kind === 'left') pick = pick === hit.id ? null : hit.id;
    else if (hit.kind === 'right' && pick) { log('answer', item.id, { ...(state().answers[item.id] || {}), [pick]: hit.id }); pick = null; }
    else if (hit.kind === 'zoom') { const ov = h('div', { class: 'overlay', onclick: () => ov.remove() }); const c = h('canvas', { width: hit.id.width, height: hit.id.height }); c.getContext('2d').drawImage(hit.id, 0, 0); ov.append(c); document.body.append(ov); return; }
    draw();
  };
  const next = () => { const s = state(); if (s.at < tgbo.order.length - 1) show(s.at + 1); else status.textContent = 'Last item. Release the track when you are done.'; };
  const prev = () => { const s = state(); if (tgbo.settings.allowBack && s.at > 0) show(s.at - 1); };
  const guard = h('div', { class: 'guard', style: { display: 'none' } });
  const onBreak = (why) => { if (state().finished || state().open) return; log('break', why); mount(guard, h('div', { class: 'card' }, h('h2', {}, 'Rule 35 — protection'), h('p', {}, `You left the test (${why}) at ${hhmm()}. This is recorded. Re-enter fullscreen to resume.`), h('button', { class: 'primary', onclick: resume }, 'Resume in fullscreen'))); guard.style.display = 'flex'; };
  const resume = async () => { try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); await navigator.keyboard?.lock?.(); } catch { return; } log('resume'); guard.style.display = 'none'; canvas.focus(); };
  const onVis = () => { if (document.hidden) onBreak('tab-hidden'); }; const onFs = () => { if (!document.fullscreenElement) onBreak('fullscreen-exit'); }; const onBlur = () => onBreak('blur');
  const refuse = (e) => { e.preventDefault(); e.stopPropagation(); status.textContent = 'Copying is not permitted.'; };
  const keys = (e) => { const k = e.key.toLowerCase(); if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 's', 'p', 'u'].includes(k)) refuse(e); if (e.key === 'PrintScreen') refuse(e); if (document.activeElement === canvas) { if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); } };
  const onPrint = () => onBreak('print');
  const bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ballast') : null; const tabId = Math.random().toString(36).slice(2);
  const onTab = (e) => { if (e.data?.tab && e.data.tab !== tabId && e.data.type === 'hello') { bc.postMessage({ type: 'busy', tab: tabId }); onBreak('another-tab'); } };
  bc?.addEventListener('message', onTab); bc?.postMessage({ type: 'hello', tab: tabId });
  const arm = () => { document.addEventListener('visibilitychange', onVis); document.addEventListener('fullscreenchange', onFs); window.addEventListener('blur', onBlur); for (const ev of ['copy', 'cut', 'contextmenu', 'dragstart']) document.addEventListener(ev, refuse); document.addEventListener('keydown', keys); window.addEventListener('beforeprint', onPrint); };
  const disarm = () => { document.removeEventListener('visibilitychange', onVis); document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('blur', onBlur); for (const ev of ['copy', 'cut', 'contextmenu', 'dragstart']) document.removeEventListener(ev, refuse); document.removeEventListener('keydown', keys); window.removeEventListener('beforeprint', onPrint); clearInterval(iv); bc?.removeEventListener('message', onTab); bc?.close(); };
  const submit = async (why) => {
    if (state().finished) return;
    if (why !== 'time') { const s = state(); const n = tgbo.order.filter((id) => s.answers[id] === undefined || s.answers[id] === '').length; if (n && !confirm(`${n} item(s) unanswered. Release anyway?`)) return; }
    log('submit', why); disarm(); forget();
    const attempt = toRelease(tgbo.order, events);
    try { navigator.keyboard?.unlock?.(); await document.exitFullscreen(); } catch { /* fine */ }
    if (practice) { const r = scoreAttempt(tgbo.test, attempt, {}); return go({ screen: 'marks', result: { ...r, title: tgbo.title, pin: p.pin }, practice: true }); }
    const text = await giveRelease(tgbo, p, p.pin, attempt); const { headers } = await dearmor(text);
    await store.del('attempt:' + tgbo.id); await store.set('crewlog', { ...((await store.get('crewlog')) || {}), released: { title: tgbo.title, when: hhmm(), hash: headers.sha256, test: tgbo.id } });
    go({ screen: 'released', tgbo, text, why, hash: headers.sha256 });
  };
  mount(root, h('div', { class: 'bar' }, h('span', {}, tgbo.title), timer, h('span', { class: 'row' }, avatar(p, 28), ` Crew ${p.pin}`)),
    h('div', { class: 'work' }, canvas, answerBox, h('div', { class: 'row' }, tgbo.settings.allowBack ? h('button', { onclick: prev }, '← Back') : null, h('button', { onclick: next }, 'Next →'), h('button', { class: 'primary', onclick: () => submit('done') }, 'Release track'), status)), guard);
  canvas.addEventListener('click', click); answerBox.addEventListener('input', () => log('answer', item.id, answerBox.value));
  arm(); tick(); if (!navigator.keyboard?.lock) log('note', 'keyboard-lock-unavailable');
  await show(state().at);
};

export const renderReleased = (root, { tgbo, text, why, hash }, go) => mount(root, h('h1', {}, 'Track released'),
  h('p', {}, why === 'time' ? 'Time expired; the attempt was released as it stood.' : 'Your attempt is sealed to the RTC and signed by your key. Send this file — or paste the text — to your instructor.'),
  h('div', { class: 'card' }, h('b', {}, 'Release hash '), h('span', { class: 'complete' }, hash), h('p', { class: 'small' }, 'This is the SHA-256 of the file you are sending. Keep it (it is also on your home screen). The cancellation the RTC sends back names the release it marks; if the hash there is not this one, the marks are not for what you released.')),
  h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => download(`release-${tgbo.title.replace(/\W+/g, '-')}.txt`, text) }, 'Download release'), h('button', { onclick: () => navigator.clipboard?.writeText(text) }, 'Copy text')),
  h('textarea', { readonly: true, rows: 6, value: text }), h('button', { onclick: () => go({ screen: 'home' }) }, 'Done'));

// ---------- marks: from a cancellation, or from practice
export const renderCancel = async (root, { text }, go) => {
  const p = await me(); if (!p) return mount(root, h('p', { class: 'bad' }, 'No crew key in this browser; this cancellation was sealed to your key.'));
  try { const r = await readCancel(text, p); const log = (await store.get('crewlog')) || {}; const mine = log.released?.hash || null; const match = mine && r.release ? mine === r.release : null;
    const rtcOk = r.by && p.minted?.by?.sig ? r.by === p.minted.by.sig : null;
    await store.set('crewlog', { ...log, cancelled: { title: r.title, grade: Math.round(r.grade * 100), match } }); return renderMarks(root, { result: r, mine, match, rtcOk }, go); }
  catch (e) { mount(root, h('h1', {}, 'Cannot open'), h('p', { class: 'bad' }, e.message), h('button', { onclick: () => go({ screen: 'home' }) }, 'Back')); }
};
const provenance = (r, mine, match, rtcOk) => h('div', { class: 'card' }, h('h2', {}, 'Does it compare?'),
  h('table', {}, h('tr', {}, h('td', {}, 'Release you sent'), h('td', { class: 'complete small' }, mine || 'not recorded in this browser')),
    h('tr', {}, h('td', {}, 'Release these marks are for'), h('td', { class: 'complete small' }, r.release || 'not named')),
    h('tr', {}, h('td', {}, 'Compare'), h('td', { class: match === true ? 'good' : match === false ? 'bad' : 'small' }, match === true ? 'YES — these marks are for the file you released' : match === false ? 'NO — these marks name a different release. Take both files to the superintendent.' : 'cannot compare (one hash missing)')),
    h('tr', {}, h('td', {}, 'Signed by'), h('td', { class: r.signed === true ? 'good' : r.signed === false ? 'bad' : 'small' }, r.signed === true ? (rtcOk === true ? 'your RTC (the one who minted you)' : rtcOk === false ? 'a different RTC key than the one who minted you' : 'the RTC key in the file') : r.signed === false ? 'BAD SIGNATURE — altered after signing' : 'unsigned'))),
  r.answers ? h('p', { class: 'small' }, `The cancellation repeats your ${Object.keys(r.answers).length} answers as marked, and the mark per item. The superintendent who approved the test can re-score your release from its audit copy without the RTC's help.`) : null,
  r.items?.length ? h('details', {}, h('summary', {}, 'Marks per item'), h('table', {}, r.items.map((i) => h('tr', {}, h('td', {}, i.id), h('td', { class: 'small' }, (i.ref || []).join(', ')), h('td', {}, i.pending ? 'not yet marked' : `${i.got}/${i.worth}`))))) : null);
export const renderMarks = (root, { result: r, practice, mine, match, rtcOk }, go) => {
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  mount(root, h('h1', {}, r.title), practice ? h('p', { class: 'small' }, 'Practice — not for record.') : provenance(r, mine, match, rtcOk),
    h('p', { class: r.pass ? 'good big' : 'bad big' }, `${Math.round(r.grade * 100)}% — ${r.pass ? 'PASS' : 'did not pass'}`, r.pending ? ` (${r.pending} short answers not yet marked)` : ''),
    h('h2', {}, 'By area'), h('table', {}, r.areas.map((a) => h('tr', {}, h('td', {}, a.label), h('td', {}, `${a.correct}/${a.total}`), h('td', {}, h('div', { class: 'meter' }, h('div', { style: { width: pct(a.correct, a.total) + '%' } })))))),
    h('h2', {}, 'Read these'), r.read.length ? h('ul', {}, r.read.map((x) => h('li', {}, h('b', {}, x.ref), x.area ? ` · ${x.area}` : '', ` · missed ${x.missed}`))) : h('p', {}, 'Nothing — every rule tested was answered correctly.'),
    h('button', { onclick: () => go({ screen: 'home' }) }, 'Done'));
};
