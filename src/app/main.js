// Routing by what you drop. One page, two roles.
import { h, mount, readFileText, readFileBytes } from './h.js';
import { sniff } from '../armor.js';
import { badgeRead } from '../crew.js';
import * as train from './train.js';
import * as rtc from './rtc.js';

const root = document.querySelector('main');
let ctx = { screen: 'home' };
const go = (next) => { ctx = next; render(); };

const openText = async (text, name = '') => {
  const kind = sniff(text);
  if (kind === 'TGBO') return go({ screen: 'copy', text });
  if (kind === 'CANCEL') return go({ screen: 'cancel', text });
  if (kind === 'SHEET') return go({ screen: 'rtc', sheetText: text });
  if (kind === 'RELEASE' || kind === 'CREW') return go({ screen: 'rtc', incoming: [{ name, text }] });
  if (/^#|\n---/.test(text)) return go({ screen: 'rtc', incoming: [{ name, text, source: true }] });
  go({ screen: 'home', error: `Not a Ballast file${name ? ': ' + name : ''}` });
};
const openFiles = async (files) => {
  const list = [...files]; if (!list.length) return;
  const texts = [];
  for (const f of list) {
    if (/\.png$/i.test(f.name)) { const t = badgeRead(await readFileBytes(f)); if (t) texts.push({ name: f.name, text: t }); else texts.push({ name: f.name, error: 'badge has no crew data (re-encoded?)' }); }
    else if (/\.(jpe?g|gif|webp|svg)$/i.test(f.name)) texts.push({ name: f.name, asset: f });
    else texts.push({ name: f.name, text: await readFileText(f) });
  }
  if (texts.length === 1 && texts[0].text) return openText(texts[0].text, texts[0].name);
  go({ screen: 'rtc', incoming: texts.map((t) => (t.text && /^#|\n---/.test(t.text) && !sniff(t.text) ? { ...t, source: true } : t)) });
};

const renderHome = () => {
  const paste = h('textarea', { rows: 5, placeholder: 'Or paste a Ballast file here (TGBO, RELEASE, CANCEL, SHEET, CREW)…' });
  const drop = h('div', { class: 'drop', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); openFiles(e.dataTransfer.files); } },
    'Drop a file here', h('br'), h('label', { class: 'btn', style: { marginTop: '10px', display: 'inline-block' } }, 'Choose files', h('input', { type: 'file', multiple: true, onchange: (e) => openFiles(e.target.files), style: { display: 'none' } })));
  mount(root,
    h('h1', {}, 'Ballast'), h('p', { class: 'small' }, 'A test that stays on the rails. Nothing leaves this page.'),
    ctx.error ? h('p', { class: 'bad' }, ctx.error) : null,
    drop, paste, h('div', { class: 'row' }, h('button', { onclick: () => paste.value.trim() && openText(paste.value) }, 'Open pasted text')),
    h('h2', {}, 'Trains'), h('div', { class: 'row' }, h('button', { onclick: () => go({ screen: 'register' }) }, 'Register crew (make a badge)')),
    h('h2', {}, 'RTC'), h('div', { class: 'row' }, h('button', { onclick: () => go({ screen: 'rtc', fresh: true }) }, 'Open the desk (new sheet)')),
    h('p', { class: 'small' }, 'Trains: register once, send your badge, drop the TGBO your RTC sends you. RTC: open a sheet, add badges, load a test, issue the TGBO, drop the releases.'));
};

const render = async () => {
  switch (ctx.screen) {
    case 'home': return renderHome();
    case 'register': return train.renderRegister(root, go);
    case 'registered': return train.renderRegistered(root, ctx, go);
    case 'copy': return train.renderCopy(root, ctx, go);
    case 'work': return train.renderWork(root, ctx, go);
    case 'released': return train.renderReleased(root, ctx, go);
    case 'cancel': return train.renderCancel(root, ctx, go);
    case 'rtc': return rtc.render(root, ctx, go);
    default: return renderHome();
  }
};
window.addEventListener('dragover', (e) => e.preventDefault()); window.addEventListener('drop', (e) => e.preventDefault());
render();
