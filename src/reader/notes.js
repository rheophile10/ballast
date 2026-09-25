// Annotations on a document: a note is anchored to a node by the quoted text and its offsets. Import/export is JSON.
export const NOTES_KIND = 'notes';
export const makeNote = (node, start, end, quote, text, by = '') => ({ id: Math.random().toString(36).slice(2, 10), node, start, end, quote, text, by, at: Date.now() });
/** Where a note sits in the node's current text: by offsets if the quote still matches, else by finding the quote, else null (the text moved on). */
export const anchor = (nodeText, note) => {
  if (nodeText.slice(note.start, note.end) === note.quote) return [note.start, note.end];
  const i = nodeText.indexOf(note.quote); return i >= 0 ? [i, i + note.quote.length] : null;
};
/** Segments of a node's text with the notes that cover each: [{start, end, notes: [...]}, ...], covering the whole text. */
export const segments = (nodeText, notes) => {
  const cuts = new Set([0, nodeText.length]); const spans = [];
  for (const n of notes) { const a = anchor(nodeText, n); if (a) { spans.push([a[0], a[1], n]); cuts.add(a[0]); cuts.add(a[1]); } }
  const pts = [...cuts].sort((x, y) => x - y); const out = [];
  for (let i = 0; i + 1 < pts.length; i++) { const [s, e] = [pts[i], pts[i + 1]]; out.push({ start: s, end: e, notes: spans.filter(([a, b]) => a <= s && e <= b).map((x) => x[2]) }); }
  return out;
};
export const exportNotes = (docId, edition, notes) => JSON.stringify({ v: 1, kind: NOTES_KIND, document: docId, edition, exported: new Date().toISOString(), notes }, null, 1);
export const importNotes = (text) => { const j = JSON.parse(text); if (j.kind !== NOTES_KIND || !Array.isArray(j.notes)) throw new Error('not a notes file'); return j; };
/** Merge incoming notes into mine: same id wins by later `at`; others append. */
export const merge = (mine, theirs) => { const by = new Map(mine.map((n) => [n.id, n])); for (const n of theirs) { const m = by.get(n.id); if (!m || (n.at || 0) > (m.at || 0)) by.set(n.id, n); } return [...by.values()]; };
