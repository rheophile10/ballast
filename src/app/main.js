// One page. You register once; someone mints your role; the page becomes that role's home.
import { h, mount, readFileText, download } from './h.js';
import { sniff } from '../armor.js';
import { readProfile, profileText, mintProfile, checkMint } from '../profile.js';
import * as store from './store.js';
import * as crew from './crew.js';
import * as rtc from './rtc.js';
import * as sup from './super.js';
import { renderRegister, profileCard } from './profile-ui.js';
import { embedded, listen, announce } from '../embed.js';

const root = document.querySelector('main');
let ctx = { screen: 'home' };
const go = (next) => { ctx = next; render(); };
const me = () => store.get('profile');

/** Take a minted profile back into this browser: it must be for my keys and properly minted. */
const acceptMint = async (text) => {
  const p = await me(); if (!p) throw new Error('register first');
  const m = await readProfile(text);
  if (m.pub !== p.pub || m.sig !== p.sig) throw new Error('that profile is not for the keys in this browser');
  if (m.role === 'none' || !(await checkMint(m))) throw new Error('that profile has no minted role');
  await store.set('profile', { ...p, role: m.role, name: m.name, photo: m.photo || p.photo, minted: m.minted });
};

const openText = async (text, name = '') => {
  const kind = sniff(text);
  const p = await me();
  try {
    if (kind === 'PROFILE' && p && (p.role === 'none' || !p.minted)) { await acceptMint(text); return go({ screen: 'home' }); } // waiting for a role: the only profile that belongs here is mine, minted
    if (kind === 'PROFILE' && p) { const m = await readProfile(text).catch(() => null); if (m && m.pub === p.pub && m.sig === p.sig) { if (p.minted && !confirm(`Replace your ${p.role} role with ${m.role} (minted by ${m.minted?.by?.name || '?'})?`)) return; await acceptMint(text); return go({ screen: 'home' }); } }
    if (kind === 'TEST') return go({ screen: 'copy', text });
    if (kind === 'CANCEL') return go({ screen: 'cancel', text });
    if (kind === 'SHEET') return go({ screen: 'rtc', sheetText: text });
    if (kind === 'BOOK') return go({ screen: 'super', bookText: text });
    if (kind === 'REPORT') return go({ screen: 'super', incoming: [{ name, text }] });
    if (kind === 'PROFILE' && p?.role === 'superintendent') return go({ screen: 'super', incoming: [{ name, text }] });
    if (kind === 'RELEASE' && p?.role === 'superintendent') return go({ screen: 'super', incoming: [{ name, text }] }); // an audit
    if (kind === 'RELEASE' || kind === 'APPROVAL' || kind === 'PROFILE') return go({ screen: 'rtc', incoming: [{ name, text }] });
    if (/^#|\n---/.test(text)) return go({ screen: p?.role === 'superintendent' ? 'super' : 'rtc', incoming: [{ name, text, source: true }] });
    go({ screen: 'home', error: `Not a Ballast file${name ? ': ' + name : ''}` });
  } catch (e) { go({ screen: 'home', error: e.message }); }
};
const openFiles = async (files) => { const f = [...files][0]; if (f) openText(await readFileText(f), f.name); };
const dropBox = (label) => {
  const paste = h('textarea', { rows: 4, placeholder: label });
  const drop = h('div', { class: 'drop', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'), ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); openFiles(e.dataTransfer.files); } },
    paste, h('div', { class: 'row' }, h('button', { onclick: () => paste.value.trim() && openText(paste.value) }, 'Open'), h('label', { class: 'btn' }, 'Choose a file', h('input', { type: 'file', style: { display: 'none' }, onchange: (e) => openFiles(e.target.files) }))));
  return drop;
};

/** Registered but not yet minted: send the registration out, wait for the profile back. */
const renderWaiting = async (p) => {
  const text = await profileText({ ...p, role: 'none', minted: undefined });
  const root_ = () => go({ screen: 'home' });
  mount(root, h('h1', {}, 'Registered — waiting for a role'), profileCard(p, text),
    h('p', {}, 'Send this registration to your RTC (a crew role) or to the superintendent (an RTC role). They send back your profile; drop it here.'),
    h('textarea', { readonly: true, rows: 6, value: text }),
    ctx.error ? h('p', { class: 'bad' }, ctx.error) : null,
    dropBox('Drop or paste the profile you get back'),
    h('details', {}, h('summary', { class: 'small' }, 'Nobody to mint me'), h('p', { class: 'small' }, 'The first superintendent mints themself. Only do this if you are running the program.'),
      h('button', { onclick: async () => { const m = await mintProfile({ ...p, role: 'superintendent' }, p, 'superintendent'); await store.set('profile', { ...p, ...m }); root_(); } }, 'Start as superintendent')));
};

const render = async () => {
  const p = await me(); announce(ctx.screen, p);
  if (ctx.screen === 'landing' || (!p && ctx.screen === 'home')) return renderRegister(root, async (np) => { await store.set('profile', np); go({ screen: 'home' }); });
  if (p && (p.role === 'none' || !p.minted) && !['work', 'practice', 'marks', 'released'].includes(ctx.screen)) return renderWaiting(p);
  switch (ctx.screen) {
    case 'home': return p.role === 'rtc' ? rtc.render(root, ctx, go) : p.role === 'superintendent' ? sup.render(root, ctx, go) : crew.renderHome(root, go, dropBox);
    case 'copy': return crew.renderCopy(root, ctx, go);
    case 'practice': return crew.renderCopy(root, { practice: true, source: ctx.source }, go);
    case 'work': return crew.renderWork(root, ctx, go);
    case 'released': return crew.renderReleased(root, ctx, go);
    case 'cancel': return crew.renderCancel(root, ctx, go);
    case 'marks': return crew.renderMarks(root, ctx, go);
    case 'rtc': return rtc.render(root, ctx, go);
    case 'super': return sup.render(root, ctx, go);
    default: return go({ screen: 'home' });
  }
};
document.body.prepend(h('nav', { class: 'top' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); go({ screen: 'home' }); } }, 'Ballast'), ' · ',
  embedded() || location.protocol === 'file:' ? null : h('a', { href: location.pathname.split('/').pop() || 'index.html', download: 'ballast.html', class: 'small', style: { marginRight: '12px' }, title: 'Save this page as one file, ballast.html, e.g. on a shared drive — the recommended way to run it' }, 'Save a copy'),
  embedded() ? null : h('a', { href: /\/ballast\//.test(location.pathname) ? '../tutorial/' : 'tutorial/', class: 'small', style: { marginRight: '12px' } }, 'Tutorial'),
  h('a', { href: '#', onclick: async (e) => { e.preventDefault(); if (confirm('Forget this browser\'s profile and keys? Any role minted to them is lost.')) { await store.del('profile'); go({ screen: 'landing' }); } } }, 'forget me')));
window.addEventListener('dragover', (e) => e.preventDefault()); window.addEventListener('drop', (e) => e.preventDefault());
listen((text, name) => openText(text, name));
try { const bc = new BroadcastChannel('ballast'); bc.addEventListener('message', (e) => { if (e.data?.type === 'busy') mount(root, h('h1', {}, 'A test is in progress in another tab'), h('p', {}, 'Close this tab and return to it. Opening this tab was recorded on that attempt.')); }); bc.postMessage({ type: 'hello', tab: 'new' }); } catch { /* no BroadcastChannel */ }
render();
