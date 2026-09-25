// Embedding: when Ballast runs inside a host page (the tutorial), files go to the host instead of downloads,
// the host can push files in, and the host can ask for a spotlight with a note. Inert when not framed.
export const embedded = () => { try { return window.parent !== window && new URLSearchParams(location.search).has('embedded'); } catch { return false; } };
const send = (msg) => window.parent.postMessage({ ballast: 1, ...msg }, '*');

/** Route a would-be download to the host. Returns true if handled. */
export const hostDownload = (name, content, type) => {
  if (!embedded()) return false;
  if (content instanceof Blob) content.text().then((text) => send({ type: 'file', name, text, mime: type || content.type }));
  else send({ type: 'file', name, text: String(content), mime: type });
  return true;
};

/** Listen for the host: {type:'open', text, name} → onOpen; {type:'hint', selector, text} → spotlight; {type:'hint'} with no selector clears. */
export const listen = (onOpen) => {
  if (!embedded()) return;
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !e.data || e.data.ballast !== 1) return;
    if (e.data.type === 'open') onOpen(String(e.data.text), String(e.data.name || ''));
    if (e.data.type === 'hint') hint(e.data.selector, e.data.text);
    if (e.data.type === 'state?') send({ type: 'state', screen: document.body.dataset.screen || '', title: document.title });
  });
  send({ type: 'ready' });
};
export const announce = (screen) => { document.body.dataset.screen = screen; if (embedded()) send({ type: 'state', screen }); };

let layer = null;
const hint = (selector, text) => {
  layer?.remove(); layer = null;
  if (!selector) return;
  const el = document.querySelector(selector); if (!el) { send({ type: 'hint-miss', selector }); return; }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const r = el.getBoundingClientRect();
  layer = document.createElement('div'); layer.className = 'coach';
  const ring = document.createElement('div'); ring.className = 'coach-ring';
  Object.assign(ring.style, { left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' });
  const note = document.createElement('div'); note.className = 'coach-note'; note.textContent = text || '';
  Object.assign(note.style, { left: Math.min(r.left, window.innerWidth - 340) + 'px', top: (r.bottom + 12 < window.innerHeight - 80 ? r.bottom + 12 : r.top - 70) + 'px' });
  layer.append(ring, note); document.body.append(layer);
};
