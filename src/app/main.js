// One page, three roles. The landing asks who you are; a dropped file opens where it belongs.
import { h, mount, readFileText } from './h.js';
import { sniff } from '../armor.js';
import * as crew from './crew.js';
import * as rtc from './rtc.js';
import * as sup from './super.js';

const root = document.querySelector('main');
let ctx = { screen: 'home' };
const go = (next) => { ctx = next; render(); };
const roleKey = 'ballast.role';
const remember = (r) => { try { localStorage.setItem(roleKey, r); } catch { /* private mode */ } };
const remembered = () => { try { return localStorage.getItem(roleKey); } catch { return null; } };

const openText = async (text, name = '') => {
  const kind = sniff(text);
  if (kind === 'TGBO') return go({ screen: 'copy', text });
  if (kind === 'CANCEL') return go({ screen: 'cancel', text });
  if (kind === 'SHEET') return go({ screen: 'rtc', sheetText: text });
  if (kind === 'BOOK') return go({ screen: 'super', bookText: text });
  if (kind === 'REPORT') return go({ screen: 'super', incoming: [{ name, text }] });
  if (kind === 'RELEASE' || kind === 'APPROVAL' || kind === 'PROFILE') return go({ screen: 'rtc', incoming: [{ name, text }] });
  if (/^#|\n---/.test(text)) return go({ screen: 'rtc', incoming: [{ name, text, source: true }] });
  go({ screen: 'home', error: `Not a Ballast file${name ? ': ' + name : ''}` });
};
const openFiles = async (files) => { const f = [...files][0]; if (f) openText(await readFileText(f), f.name); };

const renderLanding = () => {
  const card = (role, title, what, screen) => h('button', { class: 'rolecard', onclick: () => { remember(role); go({ screen }); } }, h('b', {}, title), h('span', {}, what));
  const paste = h('textarea', { rows: 4, placeholder: 'Or drop / paste any Ballast file — it opens where it belongs.' });
  const drop = h('div', { class: 'drop', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); openFiles(e.dataTransfer.files); } },
    paste, h('div', { class: 'row' }, h('button', { onclick: () => paste.value.trim() && openText(paste.value) }, 'Open'), h('label', { class: 'btn' }, 'Choose a file', h('input', { type: 'file', style: { display: 'none' }, onchange: (e) => openFiles(e.target.files) }))));
  mount(root, h('h1', {}, 'Ballast'), h('p', { class: 'small' }, 'A test that stays on the rails. Nothing leaves this page.'), ctx.error ? h('p', { class: 'bad' }, ctx.error) : null,
    h('div', { class: 'roles' },
      card('crew', 'Crew', 'I am writing a test.', 'home'),
      card('rtc', 'RTC', 'I am giving a test.', 'rtc'),
      card('superintendent', 'Superintendent', 'I approve tests and read results across classes.', 'super')),
    drop);
};

const render = async () => {
  switch (ctx.screen) {
    case 'landing': return renderLanding();
    case 'home': { if (!remembered()) return renderLanding(); const r = remembered(); if (r === 'rtc') return rtc.render(root, ctx, go); if (r === 'superintendent') return sup.render(root, ctx, go); return crew.renderHome(root, go); }
    case 'register': return crew.renderRegisterCrew(root, go);
    case 'registered': return crew.renderRegistered(root, go);
    case 'copy': return crew.renderCopy(root, ctx, go);
    case 'practice': return crew.renderCopy(root, { practice: true }, go);
    case 'work': return crew.renderWork(root, ctx, go);
    case 'released': return crew.renderReleased(root, ctx, go);
    case 'cancel': return crew.renderCancel(root, ctx, go);
    case 'marks': return crew.renderMarks(root, ctx, go);
    case 'rtc': return rtc.render(root, ctx, go);
    case 'super': return sup.render(root, ctx, go);
    default: return renderLanding();
  }
};
document.body.prepend(h('nav', { class: 'top' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); go({ screen: 'home' }); } }, 'Ballast'), ' · ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); go({ screen: 'landing' }); } }, 'switch role')));
window.addEventListener('dragover', (e) => e.preventDefault()); window.addEventListener('drop', (e) => e.preventDefault());
render();
