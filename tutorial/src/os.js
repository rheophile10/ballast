// A pretend desktop: windows, a file explorer on a pretend shared drive, a pretend browser with Ballast in it.
// Pure state → render. Nothing here is Ballast; it is the world around it.
import { h, mount } from '../../src/app/h.js';

export const FOLDERS = ['Ballast', 'Inbox', 'Registrations', 'Tests', 'Releases', 'Class profiles', 'Outbox'];
// The shared drive ships with a saved copy of Ballast: the recommended way to run it.
export const initial = () => ({ windows: [], files: [{ id: 'ballast', folder: 'Ballast', name: 'ballast.html', text: '', from: 'IT (saved from cror.ca/ballast)', at: Date.now() - 86400000 * 30, fresh: false }], mail: [], chat: [], cwd: 'Ballast', z: 1, sel: null, toast: null, clock: '' });
export const addMail = (s, m) => ({ ...s, mail: [...s.mail, { id: id(), at: Date.now(), ...m }], toast: `Mail from ${m.from}: ${m.subject}` });
export const addChat = (s, m) => ({ ...s, chat: [...s.chat, { id: id(), at: Date.now(), ...m }], toast: `Message from ${m.from}` });
const id = () => Math.random().toString(36).slice(2, 8);

// ---------- reducers (pure)
export const openWindow = (s, kind, title, extra = {}) => {
  const existing = s.windows.find((w) => w.kind === kind);
  if (existing) return focus(s, existing.id);
  const n = s.windows.length;
  const w = { id: id(), kind, title, x: 440 + n * 30, y: 40 + n * 24, w: kind === 'browser' ? 980 : kind === 'notepad' ? 640 : kind === 'chat' ? 520 : 720, h: kind === 'browser' ? 700 : kind === 'notepad' ? 560 : 460, z: s.z + 1, min: false, ...extra };
  return { ...s, windows: [...s.windows, w], z: s.z + 1 };
};
export const setUrl = (s, wid, url, title) => ({ ...s, windows: s.windows.map((w) => (w.id === wid ? { ...w, url, title } : w)) });
export const focus = (s, wid) => ({ ...s, z: s.z + 1, windows: s.windows.map((w) => (w.id === wid ? { ...w, z: s.z + 1, min: false } : w)) });
export const move = (s, wid, x, y) => ({ ...s, windows: s.windows.map((w) => (w.id === wid ? { ...w, x, y } : w)) });
export const close = (s, wid) => { dropFrame(wid); return { ...s, windows: s.windows.filter((w) => w.id !== wid) }; };
export const minimize = (s, wid) => ({ ...s, windows: s.windows.map((w) => (w.id === wid ? { ...w, min: !w.min } : w)) });
export const addFile = (s, folder, name, text, from = '', extra = {}) => ({ ...s, files: [...s.files.filter((f) => !(f.folder === folder && f.name === name)), { id: id(), folder, name, text, from, at: Date.now(), fresh: true, ...extra }], toast: from ? `${name} arrived from ${from}` : null });
export const seen = (s, fid) => ({ ...s, files: s.files.map((f) => (f.id === fid ? { ...f, fresh: false } : f)), sel: fid });
export const cd = (s, folder) => ({ ...s, cwd: folder, sel: null });
export const toast = (s, msg) => ({ ...s, toast: msg });

// ---------- render
const ICON = { txt: '📄', html: '🌐', folder: '📁' };
const ICONW = { browser: '🌐 ', notepad: '📝 ', mail: '📧 ', chat: '💬 ', explorer: '🗄️ ' };
const ext = (n) => (n.split('.').pop() || '').toLowerCase();
export const render = (root, s, act) => {
  const desktop = h('div', { class: 'desk' },
    h('div', { class: 'banner' }, 'PRETEND COMPUTER — this desktop, the shared drive and the browser are a simulation for the tutorial. Only the Ballast page inside the browser window is the real application.'),
    h('div', { class: 'icons' },
      h('button', { class: 'dicon', ondblclick: () => act('open-explorer') }, '🗄️', h('span', {}, 'Shared drive')),
      h('button', { class: 'dicon', ondblclick: () => act('open-browser') }, '🌐', h('span', {}, 'Browser')),
      h('button', { class: 'dicon', ondblclick: () => act('new-note') }, '🗒️', h('span', {}, 'Notepad')),
      h('button', { class: 'dicon', ondblclick: () => act('open-mail') }, '📧', h('span', {}, 'Mail'), s.mail.some((m) => m.fresh) ? h('span', { class: 'badge' }, s.mail.filter((m) => m.fresh).length) : null),
      h('button', { class: 'dicon', ondblclick: () => act('open-chat') }, '💬', h('span', {}, 'Messages'), s.chat.some((m) => m.fresh) ? h('span', { class: 'badge' }, s.chat.filter((m) => m.fresh).length) : null),
      ),
    ...s.windows.filter((w) => !w.min).sort((a, b) => a.z - b.z).map((w) => win(w, s, act)),
    s.toast ? h('div', { class: 'toast' }, s.toast) : null,
    h('div', { class: 'taskbar' }, h('button', { class: 'start', onclick: () => act('open-explorer') }, '⊞'),
      s.windows.map((w) => h('button', { class: 'task', onclick: () => act('focus', w.id) }, ICONW[w.kind] || '🗄️ ', w.title)),
      h('span', { class: 'clock' }, s.clock)));
  mount(root, desktop);
};

const win = (w, s, act) => {
  const bar = h('div', { class: 'titlebar', onpointerdown: (e) => { if (e.target.closest('button')) return; act('focus', w.id); const ox = e.clientX - w.x, oy = e.clientY - w.y; const mv = (ev) => act('move', w.id, Math.max(0, ev.clientX - ox), Math.max(0, ev.clientY - oy)); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); } },
    h('span', {}, ICONW[w.kind] || '🗄️ ', w.title), h('span', { class: 'winbtns' }, h('button', { onclick: () => act('minimize', w.id) }, '–'), h('button', { onclick: () => act('close', w.id) }, '✕')));
  const body = w.kind === 'explorer' ? explorer(s, act) : w.kind === 'notepad' ? (w.edit ? editor(w, act) : h('pre', { class: 'note' }, w.text)) : w.kind === 'mail' ? mail(s, act) : w.kind === 'chat' ? chat(s, act) : browser(w, s, act);
  return h('div', { class: 'win ' + w.kind, style: { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px', zIndex: w.z }, onclick: () => act('focus', w.id) }, bar, body);
};

const explorer = (s, act) => {
  const files = s.files.filter((f) => f.folder === s.cwd).sort((a, b) => b.at - a.at);
  return h('div', { class: 'explorer' },
    h('div', { class: 'addr' }, '🗄️ ', h('span', { class: 'crumb' }, '\\\\WNR-TRAINING\\Training'), ' › ', h('span', { class: 'crumb' }, s.cwd)),
    h('div', { class: 'panes' },
      h('div', { class: 'tree' }, h('div', { class: 'treehead' }, 'This PC'), h('div', { class: 'treeitem' }, '💻 Desktop'), h('div', { class: 'treehead' }, 'Network'), h('div', { class: 'treeitem' }, '🗄️ WNR-TRAINING'),
        FOLDERS.map((f) => { const n = s.files.filter((x) => x.folder === f && x.fresh).length; return h('div', { class: 'treeitem sub' + (s.cwd === f ? ' on' : ''), onclick: () => act('cd', f) }, '📁 ', f, n ? h('span', { class: 'badge' }, n) : null); })),
      h('div', { class: 'pane' }, h('div', { class: 'cols' }, h('span', {}, 'Name'), h('span', {}, 'From'), h('span', {}, 'Modified')),
        s.cwd === 'Inbox' && !s.files.some((f) => f.name === 'ballast.html') ? null : null,
        files.length ? files.map((f) => h('div', { class: 'file' + (s.sel === f.id ? ' sel' : '') + (f.fresh ? ' fresh' : ''), onclick: (e) => act(e.detail >= 2 ? 'open-file' : 'select', f.id) }, h('span', {}, ICON[ext(f.name)] || '📄', ' ', f.name), h('span', { class: 'small' }, f.from), h('span', { class: 'small' }, new Date(f.at).toLocaleTimeString()))) : h('div', { class: 'empty' }, 'This folder is empty.'))),
    h('div', { class: 'status' }, `${files.length} item(s)`, s.sel ? h('button', { class: 'openwith', onclick: () => act('open-file', s.sel) }, /\.html$/.test(s.files.find((f) => f.id === s.sel)?.name || '') || s.files.find((f) => f.id === s.sel)?.note ? 'Open' : 'Open with Ballast') : null));
};

// The iframe must survive re-renders (re-appending an <iframe> reloads it), so frames live in a fixed layer
// outside the rendered tree; each one is laid over its window's slot after every render.
const frames = new Map();
const layer = () => document.getElementById('frames') || document.body.appendChild(h('div', { id: 'frames' }));
const frameFor = (w) => { if (!frames.has(w.id)) { const f = h('iframe', { class: 'app', src: w.src, title: 'Ballast', allow: 'camera; fullscreen' }); layer().append(f); frames.set(w.id, f); } return frames.get(w.id); };
export const dropFrame = (wid) => { frames.get(wid)?.remove(); frames.delete(wid); };
export const placeFrames = (s) => { for (const [wid, f] of frames) { const w = s.windows.find((x) => x.id === wid); const slot = document.querySelector(`[data-slot="${wid}"]`); if (!w || w.min || !slot) { f.style.display = 'none'; continue; } const r = slot.getBoundingClientRect(); Object.assign(f.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', zIndex: w.z }); } };
// A pretend mail client: one message per sender, attachment opened with Ballast.
const mail = (s, act) => h('div', { class: 'mail' }, h('div', { class: 'maillist' }, s.mail.length ? s.mail.map((m) => h('div', { class: 'msg' + (m.fresh ? ' fresh' : ''), onclick: () => act('read-mail', m.id) }, h('b', {}, m.from), h('div', {}, m.subject), h('div', { class: 'small' }, new Date(m.at).toLocaleTimeString()))) : h('div', { class: 'empty' }, 'No mail.')),
  h('div', { class: 'mailbody' }, (() => { const m = s.mail.find((x) => x.id === s.readMail) || s.mail.at(-1); if (!m) return null; return [h('h3', {}, m.subject), h('div', { class: 'small' }, `From: ${m.from}`), h('p', {}, m.body), m.attachment ? h('div', { class: 'attach' }, '📎 ', m.attachment.name, ' ', h('button', { class: 'openwith', onclick: () => act('open-text', m.attachment.text, m.attachment.name) }, 'Open with Ballast')) : null]; })()));
// A pretend messaging app: the armored block pasted straight into the message body.
const chat = (s, act) => h('div', { class: 'chat' }, s.chat.length ? s.chat.map((m) => h('div', { class: 'bubble' + (m.fresh ? ' fresh' : '') }, h('b', {}, m.from), h('pre', {}, m.text), h('button', { class: 'openwith', onclick: () => act('open-text', m.text, `message from ${m.from}`) }, 'Open this message with Ballast'))) : h('div', { class: 'empty' }, 'No messages.'));
// Notepad with a document to edit: plain text, Save as… drops it into the shared drive's Tests folder.
const editor = (w, act) => { const ta = h('textarea', { class: 'noteedit', value: w.text, spellcheck: false, oninput: (e) => { w.text = e.target.value; } }); return h('div', { class: 'notepad' }, h('div', { class: 'notebar' }, h('button', { onclick: () => { const name = prompt('Save as (in \\\\WNR-TRAINING\\Training\\Tests):', w.fileName || 'my-test.txt'); if (!name) return; act('save-note', w.id, name.endsWith('.txt') ? name : name + '.txt', ta.value); } }, 'Save as…'), h('span', { class: 'small' }, ' plain text · a test is a title and settings, then items separated by --- lines')), ta); };
const browser = (w, s, act) => h('div', { class: 'browser' },
  h('div', { class: 'tabs' }, h('span', { class: 'tab on' }, '🪨 Ballast'), h('button', { class: 'newtab', title: 'New tab', onclick: () => act('new-tab') }, '+')),
  h('div', { class: 'urlbar' }, h('span', {}, '🔒'), h('input', { readonly: true, value: w.url || 'https://cror.ca/ballast/' })),
  (frameFor(w), h('div', { class: 'appslot', 'data-slot': w.id })));
