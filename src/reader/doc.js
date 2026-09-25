// A document (SPEC.md §11): a flat list of nodes — sections, rules, sub-rules, signals — each with a text hash.
// Pure functions over it: index, search, cross-references, hashes. The CROR is one such document; any JSON of
// the same shape (extracted from a PDF by reader/extract_cror.py or written by hand) reads the same way.
import { sha256, utf8, hex } from '../bytes.js';

export const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
/** The first 12 hex of SHA-256 over the normalised, lower-cased text — the same as reader/extract_cror.py. */
export const h12 = async (s) => hex(await sha256(utf8(norm(s).toLowerCase()))).slice(0, 12);

export const checkDocument = (d) => {
  if (!d || d.kind !== 'document' || d.v !== 1 || !Array.isArray(d.nodes) || !d.id) throw new Error('not a document (need {v:1, kind:"document", id, nodes})');
  const ids = new Set();
  for (const n of d.nodes) { if (!n.id || !n.kind) throw new Error('every node needs id and kind'); if (ids.has(n.id)) throw new Error(`duplicate node ${n.id}`); ids.add(n.id); }
  return d;
};

/** Index: by id, children per parent, document order. */
export const index = (doc) => {
  const by = new Map(doc.nodes.map((n) => [n.id, n]));
  const kids = new Map();
  doc.nodes.forEach((n, i) => { const p = n.parent ?? ''; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(n); n._i = i; });
  const children = (id) => kids.get(id ?? '') || [];
  const path = (id) => { const out = []; for (let n = by.get(id); n; n = by.get(n.parent)) out.unshift(n); return out; };
  return { doc, by, children, roots: children(''), path, get: (id) => by.get(id) || null };
};

/** "Rule 103(g)", "Rules 405-440", "paragraph (b)" inside rule 27 → node ids that exist, deepest first. */
export const resolve = (ix, ref, within = null) => {
  let r = norm(ref).replace(/^(CROR|Rule|Rules)\s+/i, '').replace(/\s+/g, '');
  if (/^\([a-z0-9]+\)/.test(r) && within) r = within.replace(/\(.*$/, '') + r; // "(b)" relative to the rule we are in
  for (let cand = r; cand; cand = cand.includes('(') ? cand.replace(/\([^()]*\)$/, '') : '') { if (ix.by.has(cand)) return cand; }
  const slug = 'def:' + norm(ref).replace(/^(CROR|def(inition)?)\s+/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); // a defined term, cited by name
  return ix.by.has(slug) ? slug : null;
};
const REF = /\b(Rules?|paragraphs?|Paragraphs?|Rule)\s+((?:\d{1,3}(?:\.\d+)?|\([a-z0-9]{1,4}\))(?:\([a-z0-9]{1,4}\))*(?:\s*(?:,|and|or|to|-|–)\s*(?:\d{1,3}(?:\.\d+)?|\([a-z0-9]{1,4}\))(?:\([a-z0-9]{1,4}\))*)*)/g;
/** Split text into segments: {text} or {link, id, text}. Links only where the target exists. */
export const linkify = (ix, text, within = null) => {
  const out = []; let last = 0;
  for (const m of text.matchAll(REF)) {
    const start = m.index + m[1].length + 1, list = m[2];
    if (m.index > last) out.push({ text: text.slice(last, m.index) }); out.push({ text: text.slice(m.index, start) });
    let pos = 0;
    for (const t of list.matchAll(/(?:\d{1,3}(?:\.\d+)?|\([a-z0-9]{1,4}\))(?:\([a-z0-9]{1,4}\))*/g)) {
      if (t.index > pos) out.push({ text: list.slice(pos, t.index) });
      const id = resolve(ix, t[0], within);
      out.push(id ? { link: true, id, text: t[0] } : { text: t[0] }); pos = t.index + t[0].length;
    }
    if (pos < list.length) out.push({ text: list.slice(pos) });
    last = start + list.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
};

/** Search headings and text; results in document order with title hits first; a snippet around the first hit. */
export const search = (ix, q, limit = 200) => {
  const needle = norm(q).toLowerCase(); if (needle.length < 2) return [];
  const words = needle.split(' ');
  const hits = [];
  for (const n of ix.doc.nodes) {
    const title = `${n.number || ''} ${n.title || ''}`.toLowerCase(), body = (n.text || '').toLowerCase();
    const inTitle = title.includes(needle) || n.id.toLowerCase() === needle;
    const inText = body.includes(needle) || (words.length > 1 && words.every((w) => body.includes(w)));
    if (!inTitle && !inText) continue;
    const at = Math.max(0, body.indexOf(words[0]));
    hits.push({ id: n.id, kind: n.kind, number: n.number || null, title: n.title || null, inTitle, snippet: n.text ? norm(n.text.slice(Math.max(0, at - 60), at + 120)) : '', order: n._i });
  }
  return hits.sort((a, b) => (b.inTitle - a.inTitle) || (a.order - b.order)).slice(0, limit);
};

/** Compare a test item's link "27(b)@1a2b3c4d5e6f" with the document: ok | changed | missing. */
export const checkLink = (ix, link) => {
  const [id, hash] = String(link).split('@'); const n = ix.get(id);
  if (!n) return { id, status: 'missing' };
  return { id, status: !hash || n.hash === hash ? 'ok' : 'changed', hash: n.hash };
};
/** Turn a citation like "CROR 27(b)" into "27(b)@<hash>" against this document; null when it does not resolve. */
export const linkFor = (ix, ref) => { const id = resolve(ix, ref); return id ? `${id}@${ix.get(id).hash}` : null; };
