// The reader: table of contents, search with a clickable index, cross-references as links, annotations shown on
// hover, notes and documents in and out as JSON. One function renders it from state; every action re-renders.
import { h, mount, download, readFileText } from '../app/h.js';
import { index, search, linkify, checkDocument } from './doc.js';
import { makeNote, segments, exportNotes, importNotes, merge } from './notes.js';

/**
 * renderReader(root, opts): opts = { doc, notes, onNotes(notes), onDocument(doc), at, by, onClose, compact }
 * `notes` is the list of this reader's notes; `onNotes` receives the new list after every change.
 */
export const renderReader = (root, opts) => {
  const ix = index(opts.doc); let notes = opts.notes || []; let at = opts.at && ix.get(opts.at) ? opts.at : null; let q = '', results = null;
  const setNotes = (n) => { notes = n; opts.onNotes?.(notes); draw(); };
  const goTo = (id) => { at = id; results = null; draw(); document.querySelector('.rmain')?.scrollTo(0, 0); };

  // ---------- a node's text: links resolved, notes highlighted, offsets preserved so a selection maps back to the text
  const textView = (n) => {
    const box = h('div', { class: 'rtext', 'data-node': n.id });
    for (const seg of segments(n.text, notes.filter((x) => x.node === n.id))) {
      const piece = n.text.slice(seg.start, seg.end);
      const parts = linkify(ix, piece, n.id).map((s) => (s.link ? h('a', { href: '#' + s.id, class: 'rlink', onclick: (e) => { e.preventDefault(); goTo(s.id); } }, s.text) : s.text));
      if (seg.notes.length) box.append(h('mark', { class: 'rnote', title: seg.notes.map((x) => x.text + (x.by ? ` — ${x.by}` : '')).join('\n\n'), onclick: () => { if (!opts.readOnly) editNote(seg.notes[0]); } }, ...parts));
      else box.append(...parts);
    }
    return box;
  };
  const editNote = (note) => { const t = prompt('Edit the note (empty to delete):', note.text); if (t === null) return; setNotes(t.trim() ? notes.map((x) => (x.id === note.id ? { ...x, text: t.trim(), at: Date.now() } : x)) : notes.filter((x) => x.id !== note.id)); };
  /** The current selection as {node, start, end, quote}, or null when it is not inside one node's text. */
  const selection = () => {
    const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0); const box = range.commonAncestorContainer.parentElement?.closest?.('.rtext') || (range.commonAncestorContainer.closest?.('.rtext')); if (!box) return null;
    const offsetOf = (node, off) => { let n = 0; const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode())) { if (t === node) return n + off; n += t.data.length; } return node === box ? n : -1; };
    const a = offsetOf(range.startContainer, range.startOffset), b = offsetOf(range.endContainer, range.endOffset); if (a < 0 || b < 0 || a === b) return null;
    const [s, e] = a < b ? [a, b] : [b, a]; const text = ix.get(box.dataset.node).text; return { node: box.dataset.node, start: s, end: e, quote: text.slice(s, e) };
  };
  const annotate = () => { const s = selection(); if (!s) return alert('Select some text in the rule first.'); const t = prompt(`Note on “${s.quote.slice(0, 80)}${s.quote.length > 80 ? '…' : ''}”:`); if (!t?.trim()) return; setNotes([...notes, makeNote(s.node, s.start, s.end, s.quote, t.trim(), opts.by || '')]); };

  // ---------- panes
  const crumbs = (id) => h('div', { class: 'rcrumbs' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); goTo(null); } }, opts.doc.title), ix.path(id).map((n) => [' › ', h('a', { href: '#' + n.id, onclick: (e) => { e.preventDefault(); goTo(n.id); } }, label(n))]));
  const label = (n) => n.kind === 'section' || n.kind === 'definition' ? n.title : n.kind === 'subrule' ? '(' + n.id.slice(n.id.lastIndexOf('(') + 1) : `${n.number}${n.title ? ' ' + n.title : ''}`;
  const heading = (n) => n.kind === 'subrule' ? `${n.id}` : n.kind === 'section' ? n.title : n.number ? `${n.number}. ${n.title || ''}` : n.title;
  const list = (nodes) => h('ul', { class: 'rlist' }, nodes.map((n) => h('li', {}, h('a', { href: '#' + n.id, onclick: (e) => { e.preventDefault(); goTo(n.id); } }, heading(n)), n.kind === 'subrule' || n.kind === 'definition' ? h('span', { class: 'small' }, ' ', n.text.slice(0, 90), n.text.length > 90 ? '…' : '') : null)));
  const main = () => {
    if (!at) return h('div', {}, h('h2', {}, opts.doc.title), h('p', { class: 'small' }, `${opts.doc.edition || ''} · ${opts.doc.source || ''}`), list(ix.roots));
    const n = ix.get(at); const kids = ix.children(n.id);
    return h('div', {}, crumbs(n.id), h('h2', {}, heading(n)), h('div', { class: 'small complete' }, `hash ${n.hash}`), n.text ? textView(n) : null, kids.length ? [h('h3', {}, n.kind === 'section' ? 'Rules' : 'Parts'), list(kids)] : null,
      n.kind === 'subrule' || n.kind === 'rule' ? h('p', { class: 'small' }, 'Cite as ', h('code', {}, `CROR ${n.id}`), ' · link ', h('code', {}, `${n.id}@${n.hash}`)) : null);
  };
  const side = () => {
    const box = h('input', { placeholder: 'Search headings and text…', value: q, oninput: (e) => { q = e.target.value; results = q.trim().length >= 2 ? search(ix, q) : null; drawSide(); } });
    const res = results ? [h('div', { class: 'small' }, `${results.length} result${results.length === 1 ? '' : 's'}`), h('ul', { class: 'rresults' }, results.map((r) => h('li', {}, h('a', { href: '#' + r.id, onclick: (e) => { e.preventDefault(); goTo(r.id); } }, r.number ? `${r.number} ${r.title || ''}` : r.title || r.id), r.snippet ? h('div', { class: 'small' }, r.snippet) : null)))]
      : [h('div', { class: 'small' }, 'Contents'), h('ul', { class: 'rtoc' }, ix.roots.map((s) => h('li', {}, h('a', { href: '#' + s.id, class: at === s.id ? 'on' : '', onclick: (e) => { e.preventDefault(); goTo(s.id); } }, s.title))))];
    return [box, ...res];
  };
  const toolbar = () => opts.readOnly ? h('div', { class: 'rbar' }, h('span', { class: 'small' }, `${opts.doc.title} · ${opts.doc.edition || ''} · reading only`), opts.onClose ? h('button', { onclick: opts.onClose }, 'Close') : null) : h('div', { class: 'rbar' },
    h('button', { class: 'primary', onclick: annotate }, 'Annotate selection'),
    h('button', { onclick: () => download(`notes-${opts.doc.id}.json`, exportNotes(opts.doc.id, opts.doc.edition, notes), 'application/json') }, `Notes out (${notes.length})`),
    h('label', { class: 'btn' }, 'Notes in', h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: async (e) => { try { const j = importNotes(await readFileText(e.target.files[0])); if (j.document !== opts.doc.id && !confirm(`These notes are for ${j.document}; this is ${opts.doc.id}. Import anyway?`)) return; setNotes(merge(notes, j.notes)); } catch (err) { alert(err.message); } } })),
    h('button', { onclick: () => download(`${opts.doc.id}.json`, JSON.stringify(opts.doc, null, 0), 'application/json') }, 'Document out'),
    opts.onDocument ? h('label', { class: 'btn' }, 'Document in', h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: async (e) => { try { opts.onDocument(checkDocument(JSON.parse(await readFileText(e.target.files[0])))); } catch (err) { alert(err.message); } } })) : null,
    opts.onClose ? h('button', { onclick: opts.onClose }, 'Close') : null);

  const sideEl = h('div', { class: 'rside' }), mainEl = h('div', { class: 'rmain' });
  const drawSide = () => { const focus = document.activeElement === sideEl.querySelector('input'); mount(sideEl, ...side()); if (focus) { const i = sideEl.querySelector('input'); i.focus(); i.setSelectionRange(q.length, q.length); } };
  const draw = () => { drawSide(); mount(mainEl, toolbar(), main()); };
  mount(root, h('div', { class: 'reader' + (opts.compact ? ' compact' : '') }, sideEl, mainEl)); draw();
  return { goTo, notes: () => notes };
};
