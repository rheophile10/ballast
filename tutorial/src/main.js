// The tutorial: a pretend desktop around the real Ballast, driven by a script and the cast.
import { h, mount } from '../../src/app/h.js';
import * as os from './os.js';
import { steps, PHASES, PHASE_TITLES } from './script.js';
import TEMPLATE from './template.txt';
import * as cast from './cast.js';
import { profileText } from '../../src/profile.js';
import why from '../../WHY.txt';
import armorNote from '../../ARMOR.txt';

const APP = new URLSearchParams(location.search).get('app') || '../ballast/index.html';
const root = document.getElementById('desk'); const coachEl = document.getElementById('coach');
let st = { ...os.initial({ 'Why Ballast.txt': why, 'Armored text.txt': armorNote }), ballast: { screen: '', role: undefined, pub: null, pin: null, minted: false }, step: 0, pendingSeen: 0, reportsSeen: 0, releasesSeen: 0, arrived: {}, issued: null, userReg: null };
const set = (next) => { st = next; render(); };
const frame = () => document.querySelector('iframe.app');
const tell = (msg) => frame()?.contentWindow?.postMessage({ ballast: 1, ...msg }, '*');

// ---------- what arrives, per step
const arrivals = {
  rtcRegistrations: async () => { const [d, r, t] = await cast.registrationsOf(await Promise.all([0, 1, 2].map(cast.rtc))); return [
    ['mail', { from: d.from, subject: 'Registration for the fall program', body: 'Hi — my registration is attached. Looking forward to it. — Denise', attachment: { name: d.name, text: d.text }, fresh: true }],
    ['chat', { from: r.from, text: `Hey, pasting my registration in here, the attachment got blocked by the mail filter:\n\n${r.text}\nRay`, fresh: true }],
    ['Inbox', t]]; },
  testSources: async () => cast.tests.slice(0, 2).map((t) => ['Tests', { name: t.name, text: t.source, from: 'Operating Practices' }]),
  classProfiles: async () => (await cast.classProfilesFor(st.ballast.pub, await userApproval())).map((f) => ['Class profiles', f]),
  appeal: async () => [['Inbox', await cast.appealFor(await userApproval())]],
  demoteToRtc: async () => [['Inbox', { name: 'profile-RTC-you.txt', text: await cast.mintUser(await cast.superintendent(), userPublic(), 'rtc'), from: cast.names.superintendent }]],
  crewRegistrations: async () => (await cast.registrationsOf(await cast.crewOf(0))).map((f) => ['Inbox', f]),
  testForClass: async () => { const t = cast.tests[1]; return [['Tests', { name: t.name, text: t.source, from: cast.names.superintendent }], ['Tests', { name: `approval-${t.name.replace(/\.txt$/, '')}.txt`, text: await cast.approvalFor(t.source, t.source.split('\n')[0].replace(/^#\s*/, '')), from: cast.names.superintendent }]]; },
  releases: async () => { const tf = st.files.find((f) => f.folder === 'Outbox' && /\.test\.txt$/.test(f.name)); return tf ? (await cast.releasesFor(tf.text, 0)).map((f) => ['Releases', f]) : []; },
  supProfile: async () => [['Inbox', { name: 'profile-superintendent-Boudreau.txt', text: await profileText(await cast.superintendent()), from: cast.names.superintendent }]],
  demoteToCrew: async () => [['Inbox', { name: 'profile-crew-you.txt', text: await cast.mintUser(await cast.rtc(0), userPublic(), 'crew'), from: cast.names.rtcs[0] }]],
  testForUser: async () => { const issued = await cast.testForUser(0, userPublic(), 0); st.issued = issued; return [['Inbox', { name: issued.name, text: issued.text, from: issued.from }]]; },
  cancelForUser: async () => { const rel = st.files.find((f) => f.folder === 'Outbox' && /^release-/.test(f.name)); if (!rel || !st.issued) return []; const c = await cast.cancelForUser(st.issued, rel.text, userPublic()); return [['Inbox', c]]; },
};
/** The user's approval of Test 1 (they signed it on the book); the cast administers under it so audit copies are sealed to the user. */
const userApproval = async () => { const a = await cast.userApprovalOf(st.files.filter((f) => f.folder === 'Outbox' && /^approval-/.test(f.name)).map((f) => f.text)); if (!a) throw new Error('approve Test 1 first (Test inventory → Approve)'); return a; };
/** The user's public profile as the cast sees it: from the registration Ballast exported, or reconstructed from state. */
const userPublic = () => { const reg = st.files.find((f) => f.folder === 'Outbox' && /^profile-/.test(f.name) && f.user); return reg?.parsed || st.userReg; };

const arrive = async (key) => {
  if (!key || st.arrived[key] || !arrivals[key]) return;
  st = { ...st, arrived: { ...st.arrived, [key]: true } };
  const items = await arrivals[key]().catch((e) => { console.error(e); set(os.toast(st, `Could not stage ${key}: ${e.message}`)); return []; });
  let s = st; for (const [folder, f] of items) s = folder === 'mail' ? os.addMail(s, f) : folder === 'chat' ? os.addChat(s, f) : os.addFile(s, folder, f.name, f.text, f.from);
  set(items.length ? os.toast(s, `${items.length} file(s) arrived in ${items[0][0]}`) : s);
};

// ---------- actions from the desktop
const act = async (kind, ...a) => {
  if (kind === 'open-explorer') return set(os.openWindow(st, 'explorer', 'WNR-TRAINING — Training'));
  if (kind === 'new-note') { const n = st.windows.find((w) => w.kind === 'notepad'); const doc = { title: 'Untitled - Notepad', edit: true, text: TEMPLATE, fileName: 'my-test.txt' }; return set(n ? os.focus({ ...st, windows: st.windows.map((w) => (w.id === n.id ? { ...w, ...doc } : w)) }, n.id) : os.openWindow(st, 'notepad', doc.title, doc)); }
  if (kind === 'save-note') { const [wid, name, text] = a; let s = os.addFile(st, 'Tests', name, text, 'you'); s = { ...s, windows: s.windows.map((w) => (w.id === wid ? { ...w, title: name + ' - Notepad', fileName: name } : w)), toast: `${name} saved in Tests` }; return set(s); }
  if (kind === 'open-mail') return set(os.openWindow(st, 'mail', 'Mail — Inbox'));
  if (kind === 'open-chat') return set(os.openWindow(st, 'chat', 'Messages'));
  if (kind === 'read-mail') return set({ ...st, readMail: a[0], mail: st.mail.map((m) => (m.id === a[0] ? { ...m, fresh: false } : m)) });
  if (kind === 'open-text') return openWithBallast(st, a[0], a[1]);
  if (kind === 'open-browser') return set(os.openWindow(st, 'browser', 'Ballast — cror.ca', { src: APP + '?embedded=1', url: 'https://cror.ca/ballast/' }));
  if (kind === 'focus') { const top = st.windows.reduce((t, w) => (w.z > (t?.z ?? -1) ? w : t), null); return top?.id === a[0] && !top.min ? undefined : set(os.focus(st, a[0])); } // re-rendering on focus would swallow the click that caused it
  if (kind === 'move') return set(os.move(st, a[0], a[1], a[2]));
  if (kind === 'close') return set(os.close(st, a[0]));
  if (kind === 'minimize') return set(os.minimize(st, a[0]));
  if (kind === 'cd') return set(os.cd(st, a[0]));
  if (kind === 'select') return set({ ...st, sel: a[0] });
  if (kind === 'new-tab') return set(os.toast(st, 'In a real browser a new tab would be recorded as a break on the attempt. This pretend one does nothing.'));
  if (kind === 'open-file') {
    const f = st.files.find((x) => x.id === a[0]); if (!f) return;
    let s = os.seen(st, f.id);
    if (f.note) { const n = s.windows.find((w) => w.kind === 'notepad'); return set(n ? os.focus({ ...s, windows: s.windows.map((w) => (w.id === n.id ? { ...w, title: f.name, text: f.text } : w)) }, n.id) : os.openWindow(s, 'notepad', f.name, { text: f.text })); } // one Notepad; it shows the note you opened last
    if (/\.html$/.test(f.name)) { // ballast.html on the shared drive: the same real app, opened from a file:// address
      const url = 'file://///WNR-TRAINING/Training/Ballast/ballast.html'; const b = s.windows.find((w) => w.kind === 'browser');
      s = b ? os.focus(os.setUrl(s, b.id, url, 'Ballast — ballast.html'), b.id) : os.openWindow(s, 'browser', 'Ballast — ballast.html', { src: APP + '?embedded=1', url });
      return set(os.toast(s, 'Opened ballast.html from the shared drive. (In this tutorial the file:// copy and cror.ca are the same page; in real life each keeps its own keys — pick one and stay with it.)'));
    }
    openWithBallast(s, f.text, f.name, f.folder);
  }
};

/** Hand a text to Ballast, wherever it came from: a file, a mail attachment, a chat message. */
const openWithBallast = (s, text, name, folder = '') => {
  if (!s.windows.some((w) => w.kind === 'browser')) s = os.openWindow(s, 'browser', 'Ballast — cror.ca', { src: APP + '?embedded=1', url: 'https://cror.ca/ballast/' });
  s = { ...s, chat: s.chat.map((m) => (m.text === text ? { ...m, fresh: false } : m)) };
  set(s); const bid = s.windows.find((w) => w.kind === 'browser').id;
  setTimeout(() => set(os.focus(st, bid)), 0); // opening with Ballast brings the browser forward — after the click has bubbled to the window behind
  setTimeout(() => tell({ type: 'open', text, name }), 150);
  const reg = /^registration-/.test(name) || /BEGIN BALLAST PROFILE/.test(text) && /role: none/.test(text);
  if (reg) set({ ...st, pendingSeen: st.pendingSeen + 1 });
  if (/^class-profile-/.test(name)) set({ ...st, reportsSeen: st.reportsSeen + 1 });
  if (/^release-/.test(name)) set({ ...st, releasesSeen: st.releasesSeen + 1, appealSeen: st.appealSeen || folder === 'Inbox' });
  if (folder === 'Tests' && st.files.find((f) => f.name === name && f.from === 'you')) set({ ...st, authored: true }); // a test written in Notepad reached Ballast
};

// ---------- messages from Ballast
window.addEventListener('message', async (e) => {
  const m = e.data; if (!m || m.ballast !== 1) return;
  if (m.type === 'ready') tell({ type: 'state?' });
  if (m.type === 'state') { set({ ...st, ballast: { screen: m.screen, role: m.role, pub: m.pub, pin: m.pin, minted: m.minted }, userReg: m.profile && m.role === 'none' ? m.profile : st.userReg }); coach(); }
  if (m.type === 'file') {
    let s = os.addFile(st, 'Outbox', m.name, m.text, 'you'); s = { ...s, toast: `${m.name} saved to Outbox` };
    if (/^profile-/.test(m.name) && !st.userReg) { try { const { dearmor } = await import('../../src/armor.js'); const { body } = await dearmor(m.text, 'PROFILE'); s = { ...s, userReg: body }; } catch { /* not a profile */ } }
    set(s);
  }
});

// ---------- the coach
const current = () => steps[st.step];
const coach = () => {
  const s = current(); if (!s) return;
  if (s.hint) tell({ type: 'hint', selector: s.hint[0], text: s.hint[1] }); else tell({ type: 'hint' });
  if (s.done(st) && !st.stepDone) { st = { ...st, stepDone: true, ...(s.onDone ? s.onDone(st) : {}) }; render(); if (!s.info) setTimeout(() => { if (current() === s) next(); }, 1500); } // steps advance themselves; informational ones wait for Next
};
const next = async () => {
  const n = st.step + 1; if (n >= steps.length) return;
  set({ ...st, step: n, stepDone: false });
  const s = steps[n]; if (s.explorer) set(os.cd(os.openWindow(st, 'explorer', 'WNR-TRAINING — Training'), s.explorer));
  await arrive(s.arrive); coach();
};
let navOpen = false; // the contents pane opens on request; the current section comes first
/** The contents: chunks and their sections; past ones can be re-read, the current one is marked, the rest wait. */
const nav = () => h('details', { class: 'nav', open: navOpen, ontoggle: (e) => { navOpen = e.target.open; } }, h('summary', {}, 'Contents'),
  PHASES.map((ph) => h('div', { class: 'navchunk' }, h('div', { class: 'navhead' }, PHASE_TITLES[ph]), h('ol', {}, steps.map((x, i) => ({ x, i })).filter(({ x }) => x.phase === ph).map(({ x, i }) => h('li', { class: i === st.step ? 'cur' : i < st.step ? 'past' : 'todo' }, i <= st.step ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); st = { ...st, viewStep: i === st.step ? null : i }; renderCoach(); } }, x.title) : x.title))))));
const renderCoach = () => {
  const s = current(); const done = s.done(st) || st.stepDone; const phaseIx = PHASES.indexOf(s.phase);
  if (st.viewStep != null && st.viewStep !== st.step) { const v = steps[st.viewStep]; return mount(coachEl, nav(), h('div', { class: 'phase' }, `${PHASE_TITLES[v.phase]} — re-reading`), h('h2', {}, v.title), v.text.split('\n\n').map((t) => h('p', {}, t)), h('div', { class: 'btns' }, h('button', { class: 'primary', onclick: () => { st = { ...st, viewStep: null }; renderCoach(); } }, 'Back to where I am'))); }
  mount(coachEl, nav(), h('div', { class: 'phase' }, `${PHASE_TITLES[s.phase]} · ${phaseIx + 1} of ${PHASES.length}`), h('h2', {}, s.title),
    h('div', { class: 'progress' }, h('div', { style: { width: Math.round((100 * st.step) / (steps.length - 1)) + '%' } })),
    s.text.split('\n\n').map((t) => h('p', {}, t)), s.arrive && !st.arrived[s.arrive] ? h('p', { class: 'waiting' }, 'staging files…') : null,
    st.step >= steps.length - 1 ? h('p', { class: 'done' }, 'The end.') : done ? h('p', { class: 'done' }, s.info ? 'Next when you are ready.' : 'Done — moving on.') : h('p', { class: 'waiting' }, 'Waiting for you to do that…'),
    h('div', { class: 'btns' }, h('button', { class: 'primary', disabled: !done || st.step >= steps.length - 1, onclick: next }, 'Next'), h('button', { onclick: next, disabled: st.step >= steps.length - 1 }, 'Skip'), h('button', { onclick: () => { tell({ type: 'hint' }); } }, 'Hide hint')),
    h('p', { class: 'small', style: { marginTop: '14px', color: '#92400e' } }, 'Files that "arrive" are generated on your computer by fictional people whose keys ship with this tutorial. Nothing is sent anywhere.'));
};
const render = () => { os.render(root, st, act); os.placeFrames(st); renderCoach(); };
setInterval(() => { const now = new Date(); const c = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); if (c !== st.clock) set({ ...st, clock: c }); const s = current(); if (s && !st.stepDone && s.done(st)) coach(); }, 1000);
render(); arrive(steps[0].arrive);
