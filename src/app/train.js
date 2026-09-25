// The train's side: register crew, copy a TGBO, work it in fullscreen, release, read a cancellation.
import { h, mount, download, fmtTime, hhmm, readFileBytes } from './h.js';
import * as store from './store.js';
import { keypair } from '../crypto.js';
import { registerCrew, badgeWrite } from '../crew.js';
import { copyTGBO } from '../tgbo.js';
import { giveRelease } from '../release.js';
import { readCancel } from '../cancel.js';
import { fold, toRelease } from './attempt.js';
import { drawItem, imagesFor, forget } from './draw.js';

const now = () => Date.now();

/** Identity: one non-extractable ECDH key in IndexedDB. */
export const identity = async () => (await store.get('crew')) || null;
const makeIdentity = async (name, pin) => { const kp = await keypair(false); const crew = { name, pin, pub: kp.pub, priv: kp.priv }; await store.set('crew', crew); return crew; };

// ---------- register
export const renderRegister = (root, go) => {
  let photoBytes = null, stream = null;
  const video = h('video', { autoplay: true, playsinline: true, style: { display: 'none', width: '240px', borderRadius: '8px' } });
  const preview = h('canvas', { width: 240, height: 240, style: { display: 'none', borderRadius: '8px' } });
  const status = h('p', { class: 'status' });
  const stopCam = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; video.style.display = 'none'; };
  const usePhoto = (drawFn) => { const c = preview.getContext('2d'); c.fillStyle = '#ddd'; c.fillRect(0, 0, 240, 240); drawFn(c); preview.style.display = 'block'; preview.toBlob(async (b) => { photoBytes = new Uint8Array(await b.arrayBuffer()); }, 'image/png'); };
  const webcam = async () => {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 480 } }); video.srcObject = stream; video.style.display = 'block'; }
    catch { status.textContent = 'No camera available — upload a photo instead.'; }
  };
  const snap = () => { if (!stream) return; usePhoto((c) => { const s = Math.min(video.videoWidth, video.videoHeight); c.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, 240, 240); }); stopCam(); };
  const upload = async (e) => { const f = e.target.files[0]; if (!f) return; const bmp = await createImageBitmap(f); const s = Math.min(bmp.width, bmp.height); usePhoto((c) => c.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 240, 240)); };
  const name = h('input', { placeholder: 'Name', required: true, autocomplete: 'name' });
  const pin = h('input', { placeholder: 'PIN (engine number)', inputmode: 'numeric', pattern: '\\d{4,8}', required: true });
  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(pin.value)) { status.textContent = 'PIN must be 4–8 digits.'; return; }
    const crew = await makeIdentity(name.value.trim(), pin.value.trim());
    const text = await registerCrew(crew.name, crew.pin, crew.pub);
    let png;
    if (photoBytes) png = badgeWrite(photoBytes, text);
    else { const c = h('canvas', { width: 240, height: 240 }); const x = c.getContext('2d'); x.fillStyle = '#334'; x.fillRect(0, 0, 240, 240); x.fillStyle = '#fff'; x.font = 'bold 28px Arial'; x.fillText(`CN ${crew.pin}`, 20, 120); x.font = '16px Arial'; x.fillText(crew.name, 20, 160); png = badgeWrite(new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer()), text); }
    download(`badge-CN${crew.pin}.png`, new Blob([png], { type: 'image/png' }));
    stopCam();
    go({ screen: 'registered', crew, text });
  };
  mount(root,
    h('h1', {}, 'Register crew'),
    h('p', {}, 'Your browser makes a key it will keep. Your badge carries the public half to the RTC. Send the badge (or the text) to your instructor.'),
    h('form', { onsubmit: submit, class: 'card' },
      h('label', {}, 'Name ', name), h('label', {}, 'PIN ', pin),
      h('div', { class: 'row' }, h('button', { type: 'button', onclick: webcam }, 'Use webcam'), h('button', { type: 'button', onclick: snap }, 'Take photo'), h('label', { class: 'btn' }, 'Upload photo', h('input', { type: 'file', accept: 'image/*', onchange: upload, style: { display: 'none' } }))),
      video, preview, status,
      h('button', { type: 'submit', class: 'primary' }, 'Make my badge')));
};

export const renderRegistered = (root, { crew, text }, go) => mount(root,
  h('h1', {}, `CN ${crew.pin} — ${crew.name}`),
  h('p', {}, 'Badge downloaded. If attachments are blocked, paste this into your message instead:'),
  h('textarea', { readonly: true, rows: 8, value: text, onclick: (e) => e.target.select() }),
  h('div', { class: 'row' }, h('button', { onclick: () => navigator.clipboard?.writeText(text) }, 'Copy text'), h('button', { onclick: () => go({ screen: 'home' }) }, 'Done')));

// ---------- copy a TGBO
export const renderCopy = async (root, { text }, go) => {
  const crew = await identity();
  if (!crew) return mount(root, h('h1', {}, 'No crew registered'), h('p', {}, 'Register first, then send your badge to the RTC and wait for a TGBO addressed to you.'), h('button', { onclick: () => go({ screen: 'register' }) }, 'Register'));
  let tgbo;
  try { tgbo = await copyTGBO(text, { priv: crew.priv, pub: crew.pub }, crew.pin); }
  catch (e) { return mount(root, h('h1', {}, 'Cannot copy this TGBO'), h('p', { class: 'bad' }, e.message), h('button', { onclick: () => go({ screen: 'home' }) }, 'Back')); }
  const saved = await store.get('attempt:' + tgbo.id);
  const repeat = h('input', { placeholder: 'Repeat the four characters', maxlength: 4, autocomplete: 'off', style: { textTransform: 'uppercase' } });
  const status = h('p', { class: 'status' });
  const start = async (e) => {
    e.preventDefault();
    if (repeat.value.trim().toUpperCase() !== tgbo.complete) { status.textContent = 'Does not compare. Read it again and repeat.'; return; }
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { status.textContent = 'Fullscreen is required for this test.'; return; }
    try { await navigator.keyboard?.lock?.(); } catch { /* not every browser; logged below */ }
    const events = saved?.events?.length ? saved.events : [[now(), 'copy', tgbo.complete]];
    go({ screen: 'work', tgbo, crew, events });
  };
  mount(root,
    h('h1', {}, tgbo.title),
    h('div', { class: 'card' },
      h('p', {}, `TGBO addressed to CN ${crew.pin}. ${tgbo.order.length} items · ${fmtTime(tgbo.settings.time)} · pass mark ${Math.round(tgbo.settings.pass * 100)}%.`),
      h('p', {}, 'Rule 136. Copy as transmitted, then repeat back:'),
      h('p', { class: 'complete' }, `Complete ${hhmm()} · RTC ${tgbo.rtcName || ''} · `, h('b', {}, tgbo.complete)),
      saved?.events?.length ? h('p', { class: 'status' }, `An attempt in progress was found (${Object.keys(fold(tgbo.order, saved.events).answers).length} answered). It will resume.`) : null,
      h('form', { onsubmit: start, class: 'row' }, repeat, h('button', { type: 'submit', class: 'primary' }, 'Repeat and enter fullscreen')),
      status,
      h('p', { class: 'small' }, 'From here on: one item at a time, fullscreen, no copying. Leaving fullscreen or the tab is recorded.')));
};

// ---------- work the test
export const renderWork = async (root, { tgbo, crew, events }, go) => {
  forget();
  const log = (kind, a, b) => { events.push([now(), kind, a, b]); store.set('attempt:' + tgbo.id, { events }); };
  const state = () => fold(tgbo.order, events);
  const canvas = h('canvas', { width: 900, height: 700, tabindex: 0 });
  const timer = h('span', { class: 'timer' });
  const status = h('p', { class: 'status' });
  const answerBox = h('textarea', { rows: 4, placeholder: 'Your answer (short answer item)', style: { display: 'none' } });
  let item = null, hits = [], pick = null, images = [];
  const watermark = `CN ${crew.pin} ${crew.name} ${hhmm()}`;

  const deadline = () => (state().started || now()) + tgbo.settings.time * 1000;
  const tick = () => { const left = Math.max(0, Math.ceil((deadline() - now()) / 1000)); timer.textContent = fmtTime(left); if (left <= 0 && !state().finished) submit('time'); };
  const iv = setInterval(tick, 500);

  const draw = () => {
    const s = state();
    const r = drawItem(canvas, item, { answer: s.answers[item.id], pick, images, watermark, index: s.at, count: tgbo.order.length });
    hits = r.hits; canvas.height = Math.max(360, r.height);
    const r2 = drawItem(canvas, item, { answer: s.answers[item.id], pick, images, watermark, index: s.at, count: tgbo.order.length }); hits = r2.hits;
    canvas.dataset.hits = JSON.stringify(hits.map(({ x, y, w, h: hh, kind, id }) => ({ x, y, w, h: hh, kind, id: typeof id === 'string' ? id : 'img' })));
    answerBox.style.display = item.type === 'short' ? 'block' : 'none';
    if (item.type === 'short') answerBox.value = s.answers[item.id] || '';
  };
  const show = async (i) => {
    const id = tgbo.order[Math.max(0, Math.min(tgbo.order.length - 1, i))];
    item = await tgbo.item(id); images = await imagesFor(item); pick = null;
    log('show', id); draw(); canvas.focus();
  };
  const click = (e) => {
    const rect = canvas.getBoundingClientRect(), x = (e.clientX - rect.left) * (canvas.width / rect.width), y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const hit = hits.find((t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h); if (!hit) return;
    if (hit.kind === 'option') log('answer', item.id, hit.id);
    else if (hit.kind === 'left') pick = pick === hit.id ? null : hit.id;
    else if (hit.kind === 'right' && pick) { log('answer', item.id, { ...(state().answers[item.id] || {}), [pick]: hit.id }); pick = null; }
    else if (hit.kind === 'zoom') return zoom(hit.id);
    draw();
  };
  const zoom = (bmp) => { const ov = h('div', { class: 'overlay', onclick: () => ov.remove() }); const c = h('canvas', { width: bmp.width, height: bmp.height }); c.getContext('2d').drawImage(bmp, 0, 0); ov.append(c); document.body.append(ov); };
  const typed = () => log('answer', item.id, answerBox.value);
  const next = () => { const s = state(); if (s.at < tgbo.order.length - 1) show(s.at + 1); else status.textContent = 'Last item. Release the track when you are done.'; };
  const prev = () => { const s = state(); if (tgbo.settings.allowBack && s.at > 0) show(s.at - 1); };

  // --- protection: leaving fullscreen or the tab is a break; copying is refused.
  const onBreak = (why) => { if (state().finished || state().open) return; log('break', why); mount(guard, h('div', { class: 'card' }, h('h2', {}, 'Rule 35 — protection'), h('p', {}, `You left the test (${why}) at ${hhmm()}. This is recorded. Re-enter fullscreen to resume.`), h('button', { class: 'primary', onclick: resume }, 'Resume in fullscreen'))); guard.style.display = 'flex'; };
  const resume = async () => { try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); await navigator.keyboard?.lock?.(); } catch { return; } log('resume'); guard.style.display = 'none'; canvas.focus(); };
  const guard = h('div', { class: 'guard', style: { display: 'none' } });
  const onVis = () => { if (document.hidden) onBreak('tab-hidden'); };
  const onFs = () => { if (!document.fullscreenElement) onBreak('fullscreen-exit'); };
  const onBlur = () => onBreak('blur');
  const refuse = (e) => { e.preventDefault(); e.stopPropagation(); status.textContent = 'Copying is not permitted.'; };
  const keys = (e) => { const k = e.key.toLowerCase(); if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 's', 'p', 'u'].includes(k)) refuse(e); if (e.key === 'PrintScreen') refuse(e); if (e.key === 'ArrowRight' && document.activeElement === canvas) next(); if (e.key === 'ArrowLeft' && document.activeElement === canvas) prev(); };
  const arm = () => { document.addEventListener('visibilitychange', onVis); document.addEventListener('fullscreenchange', onFs); window.addEventListener('blur', onBlur); for (const ev of ['copy', 'cut', 'contextmenu', 'dragstart']) document.addEventListener(ev, refuse); document.addEventListener('keydown', keys); window.addEventListener('beforeprint', () => onBreak('print')); };
  const disarm = () => { document.removeEventListener('visibilitychange', onVis); document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('blur', onBlur); for (const ev of ['copy', 'cut', 'contextmenu', 'dragstart']) document.removeEventListener(ev, refuse); document.removeEventListener('keydown', keys); clearInterval(iv); };

  const submit = async (why) => {
    if (state().finished) return;
    if (why !== 'time') { const s = state(); const n = tgbo.order.filter((id) => s.answers[id] === undefined || s.answers[id] === '').length; if (n && !confirm(`${n} item(s) unanswered. Release anyway?`)) return; }
    log('submit', why); disarm(); forget();
    const attempt = toRelease(tgbo.order, events);
    const text = await giveRelease(tgbo, { priv: crew.priv, pub: crew.pub }, crew.pin, attempt);
    await store.del('attempt:' + tgbo.id);
    try { navigator.keyboard?.unlock?.(); await document.exitFullscreen(); } catch { /* fine */ }
    go({ screen: 'released', tgbo, text, why });
  };

  mount(root,
    h('div', { class: 'bar' }, h('span', {}, tgbo.title), timer, h('span', {}, `CN ${crew.pin}`)),
    h('div', { class: 'work' }, canvas, answerBox,
      h('div', { class: 'row' }, tgbo.settings.allowBack ? h('button', { onclick: prev }, '← Back') : null, h('button', { onclick: next }, 'Next →'), h('button', { class: 'primary', onclick: () => submit('done') }, 'Release track'), status)),
    guard);
  canvas.addEventListener('click', click); answerBox.addEventListener('input', typed);
  arm(); tick();
  if (!navigator.keyboard?.lock) log('note', 'keyboard-lock-unavailable');
  await show(state().at);
};

export const renderReleased = (root, { tgbo, text, why }, go) => mount(root,
  h('h1', {}, 'Track released'),
  h('p', {}, why === 'time' ? 'Time expired; the attempt was released as it stood.' : 'Your attempt is sealed to the RTC. Send this file — or paste the text — to your instructor.'),
  h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => download(`release-${tgbo.title.replace(/\W+/g, '-')}.spike`, text) }, 'Download release'), h('button', { onclick: () => navigator.clipboard?.writeText(text) }, 'Copy text')),
  h('textarea', { readonly: true, rows: 6, value: text }),
  h('button', { onclick: () => go({ screen: 'home' }) }, 'Done'));

// ---------- read a cancellation (marks)
export const renderCancel = async (root, { text }, go) => {
  const crew = await identity();
  if (!crew) return mount(root, h('p', { class: 'bad' }, 'No crew key in this browser; this cancellation was sealed to your key.'));
  let r; try { r = await readCancel(text, { priv: crew.priv, pub: crew.pub }); }
  catch (e) { return mount(root, h('h1', {}, 'Cannot open'), h('p', { class: 'bad' }, e.message), h('button', { onclick: () => go({ screen: 'home' }) }, 'Back')); }
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  mount(root,
    h('h1', {}, r.title), h('p', { class: r.pass ? 'good big' : 'bad big' }, `${Math.round(r.grade * 100)}% — ${r.pass ? 'PASS' : 'did not pass'}`, r.pending ? ` (${r.pending} short answers not yet marked)` : ''),
    h('h2', {}, 'By area'),
    h('table', {}, r.areas.map((a) => h('tr', {}, h('td', {}, a.label), h('td', {}, `${a.correct}/${a.total}`), h('td', {}, h('div', { class: 'meter' }, h('div', { style: { width: pct(a.correct, a.total) + '%' } })))))),
    h('h2', {}, 'Read these'),
    r.read.length ? h('ul', {}, r.read.map((x) => h('li', {}, h('b', {}, x.ref), x.area ? ` · ${x.area}` : '', ` · missed ${x.missed}`))) : h('p', {}, 'Nothing — every rule tested was answered correctly.'),
    h('button', { onclick: () => go({ screen: 'home' }) }, 'Done'));
};
