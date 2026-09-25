// The crew's side: register, practice, copy a TGBO, work it, release, read a cancellation.
import { h, mount, download, fmtTime, hhmm } from './h.js';
import * as store from './store.js';
import { profileText } from '../profile.js';
import { copyTGBO } from '../tgbo.js';
import { giveRelease } from '../release.js';
import { readCancel } from '../cancel.js';
import { parseTest, publicItem } from '../txt.js';
import { scoreAttempt } from '../score.js';
import { PRACTICE } from '../practice.js';
import { fold, toRelease } from './attempt.js';
import { drawItem, imagesFor, forget } from './draw.js';
import { svgFor } from '../svg.js';
import { shuffled } from '../shuffle.js';
import { renderRegister, profileCard, avatar } from './profile-ui.js';

const now = () => Date.now();
export const me = async () => (await store.get('profile')) || null;

// ---------- home: a checklist
export const renderHome = async (root, go) => {
  const p = await me(); const log = (await store.get('crewlog')) || {};
  const step = (n, label, done, detail, action) => h('li', { class: done ? 'done' : (!p && n > 1) ? 'later' : 'next' }, h('b', {}, `${n}. ${label}`), detail ? h('div', { class: 'small' }, detail) : null, action);
  mount(root,
    h('h1', {}, 'Crew'),
    p ? profileCard(p, await profileText(p)) : null,
    h('ol', { class: 'steps' },
      step(1, 'Register', !!p, p ? `${p.name}, CN ${p.pin}` : 'Name, PIN, photo. Your browser keeps your keys.', p ? null : h('button', { class: 'primary', onclick: () => go({ screen: 'register' }) }, 'Register')),
      step(2, 'Send your profile to the RTC', !!log.sent, 'Download the profile text and attach it, or paste it into a message.', p && !log.sent ? h('button', { onclick: async () => { await store.set('crewlog', { ...log, sent: now() }); go({ screen: 'home' }); } }, 'I have sent it') : null),
      step(3, 'Copy the TGBO the RTC sends you', !!log.copied, log.copied ? `${log.copied.title} at ${log.copied.when}` : 'Drop or paste the TGBO below.', null),
      step(4, 'Release', !!log.released, log.released ? `${log.released.title} at ${log.released.when}` : 'Fullscreen, one item at a time, then Release track.', null),
      step(5, 'Read your cancellation', !!log.cancelled, log.cancelled ? `${log.cancelled.grade}% on ${log.cancelled.title}` : 'Drop the cancellation the RTC sends back to see your marks and what to read.', null)),
    h('h2', {}, 'Practice'), h('p', { class: 'small' }, 'The same drill — repeat, fullscreen, one item at a time — on a built-in test that marks itself. Not for record.'),
    h('button', { onclick: () => go({ screen: 'practice' }) }, 'Start practice'));
};

export const renderRegisterCrew = (root, go) => renderRegister(root, 'crew', 'crew', async (p) => { await store.set('profile', p); go({ screen: 'registered' }); });
export const renderRegistered = async (root, go) => { const p = await me(); const t = await profileText(p); mount(root, h('h1', {}, 'Registered'), profileCard(p, t), h('p', {}, 'Send this to your RTC. If attachments are blocked, paste the text into the message.'), h('textarea', { readonly: true, rows: 6, value: t }), h('button', { onclick: () => go({ screen: 'home' }) }, 'Done')); };

// ---------- copy a TGBO (or start the practice)
const clearanceSvg = (tgbo, p) => svgFor(`form clearance kind="Clearance" no=${tgbo.clearance} to="CN ${p.pin}" proceed="item 1 → item ${tgbo.order.length}" until="repeated back" call="before ${fmtTime(tgbo.settings.time)}" complete="${hhmm()}" rtc="${tgbo.rtcName || ''}"`);
export const renderCopy = async (root, { text, practice }, go) => {
  const p = await me();
  if (!p) return mount(root, h('h1', {}, 'Not registered'), h('p', {}, 'Register first; a TGBO is addressed to your key.'), h('button', { onclick: () => go({ screen: 'register' }) }, 'Register'));
  let tgbo;
  try { tgbo = practice ? await practiceTGBO(p) : await copyTGBO(text, p, p.pin); }
  catch (e) { return mount(root, h('h1', {}, 'Cannot copy this TGBO'), h('p', { class: 'bad' }, e.message), h('button', { onclick: () => go({ screen: 'home' }) }, 'Back')); }
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
      h('p', {}, `Clearance No. ${tgbo.clearance} to CN ${p.pin} · ${tgbo.order.length} items · ${fmtTime(tgbo.settings.time)} · pass ${Math.round(tgbo.settings.pass * 100)}%`),
      h('p', {}, 'Rule 136 — copy as transmitted, then repeat back:'), h('p', { class: 'complete' }, `Complete ${hhmm()} · RTC ${tgbo.rtcName || ''} · `, h('b', {}, tgbo.complete)),
      saved?.events?.length ? h('p', { class: 'status' }, `An attempt in progress was found (${Object.keys(fold(tgbo.order, saved.events).answers).length} answered). It will resume.`) : null,
      h('form', { onsubmit: start, class: 'row' }, repeat, h('button', { type: 'submit', class: 'primary' }, 'Repeat and enter fullscreen')), status,
      h('p', { class: 'small' }, 'From here on: one item at a time, fullscreen, no copying. Leaving fullscreen or the tab is recorded.')));
};

/** The practice test, built locally: same reader shape as a real TGBO, no crypto, answers kept for self-marking. */
const practiceTGBO = async (p) => {
  const { test } = await parseTest(PRACTICE);
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
  const watermark = `CN ${p.pin} ${p.name} ${hhmm()}`;
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
  const arm = () => { document.addEventListener('visibilitychange', onVis); document.addEventListener('fullscreenchange', onFs); window.addEventListener('blur', onBlur); for (const ev of ['copy', 'cut', 'contextmenu', 'dragstart']) document.addEventListener(ev, refuse); document.addEventListener('keydown', keys); window.addEventListener('beforeprint', onPrint); };
  const disarm = () => { document.removeEventListener('visibilitychange', onVis); document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('blur', onBlur); for (const ev of ['copy', 'cut', 'contextmenu', 'dragstart']) document.removeEventListener(ev, refuse); document.removeEventListener('keydown', keys); window.removeEventListener('beforeprint', onPrint); clearInterval(iv); };
  const submit = async (why) => {
    if (state().finished) return;
    if (why !== 'time') { const s = state(); const n = tgbo.order.filter((id) => s.answers[id] === undefined || s.answers[id] === '').length; if (n && !confirm(`${n} item(s) unanswered. Release anyway?`)) return; }
    log('submit', why); disarm(); forget();
    const attempt = toRelease(tgbo.order, events);
    try { navigator.keyboard?.unlock?.(); await document.exitFullscreen(); } catch { /* fine */ }
    if (practice) { const r = scoreAttempt(tgbo.test, attempt, {}); return go({ screen: 'marks', result: { ...r, title: tgbo.title, pin: p.pin }, practice: true }); }
    const text = await giveRelease(tgbo, p, p.pin, attempt);
    await store.del('attempt:' + tgbo.id); await store.set('crewlog', { ...((await store.get('crewlog')) || {}), released: { title: tgbo.title, when: hhmm() } });
    go({ screen: 'released', tgbo, text, why });
  };
  mount(root, h('div', { class: 'bar' }, h('span', {}, tgbo.title), timer, h('span', { class: 'row' }, avatar(p, 28), ` CN ${p.pin}`)),
    h('div', { class: 'work' }, canvas, answerBox, h('div', { class: 'row' }, tgbo.settings.allowBack ? h('button', { onclick: prev }, '← Back') : null, h('button', { onclick: next }, 'Next →'), h('button', { class: 'primary', onclick: () => submit('done') }, 'Release track'), status)), guard);
  canvas.addEventListener('click', click); answerBox.addEventListener('input', () => log('answer', item.id, answerBox.value));
  arm(); tick(); if (!navigator.keyboard?.lock) log('note', 'keyboard-lock-unavailable');
  await show(state().at);
};

export const renderReleased = (root, { tgbo, text, why }, go) => mount(root, h('h1', {}, 'Track released'),
  h('p', {}, why === 'time' ? 'Time expired; the attempt was released as it stood.' : 'Your attempt is sealed to the RTC. Send this file — or paste the text — to your instructor.'),
  h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => download(`release-${tgbo.title.replace(/\W+/g, '-')}.txt`, text) }, 'Download release'), h('button', { onclick: () => navigator.clipboard?.writeText(text) }, 'Copy text')),
  h('textarea', { readonly: true, rows: 6, value: text }), h('button', { onclick: () => go({ screen: 'home' }) }, 'Done'));

// ---------- marks: from a cancellation, or from practice
export const renderCancel = async (root, { text }, go) => {
  const p = await me(); if (!p) return mount(root, h('p', { class: 'bad' }, 'No crew key in this browser; this cancellation was sealed to your key.'));
  try { const r = await readCancel(text, p); await store.set('crewlog', { ...((await store.get('crewlog')) || {}), cancelled: { title: r.title, grade: Math.round(r.grade * 100) } }); return renderMarks(root, { result: r }, go); }
  catch (e) { mount(root, h('h1', {}, 'Cannot open'), h('p', { class: 'bad' }, e.message), h('button', { onclick: () => go({ screen: 'home' }) }, 'Back')); }
};
export const renderMarks = (root, { result: r, practice }, go) => {
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  mount(root, h('h1', {}, r.title), practice ? h('p', { class: 'small' }, 'Practice — not for record.') : null,
    h('p', { class: r.pass ? 'good big' : 'bad big' }, `${Math.round(r.grade * 100)}% — ${r.pass ? 'PASS' : 'did not pass'}`, r.pending ? ` (${r.pending} short answers not yet marked)` : ''),
    h('h2', {}, 'By area'), h('table', {}, r.areas.map((a) => h('tr', {}, h('td', {}, a.label), h('td', {}, `${a.correct}/${a.total}`), h('td', {}, h('div', { class: 'meter' }, h('div', { style: { width: pct(a.correct, a.total) + '%' } })))))),
    h('h2', {}, 'Read these'), r.read.length ? h('ul', {}, r.read.map((x) => h('li', {}, h('b', {}, x.ref), x.area ? ` · ${x.area}` : '', ` · missed ${x.missed}`))) : h('p', {}, 'Nothing — every rule tested was answered correctly.'),
    h('button', { onclick: () => go({ screen: 'home' }) }, 'Done'));
};
