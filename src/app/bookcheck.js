// Authoring against the rulebook: link a source's ref: lines to node@hash, and see which items have drifted.
import { h } from './h.js';
import { index } from '../reader/doc.js';
import { linkSource, checkSource } from '../reader/linkcheck.js';
import { getDocument } from './docs.js';

const cls = { ok: 'good', changed: 'bad', missing: 'bad', unlinked: 'small', 'no-ref': 'small' };
/** A card with Check and (optionally) Link buttons for one source; `onLinked(newSource)` receives the rewritten text. */
export const bookCheck = (source, onLinked) => {
  const box = h('div', { class: 'card' }); const out = h('div');
  getDocument().then((doc) => {
    if (!doc) return box.append(h('p', { class: 'small' }, 'Load a rulebook (Rulebook in the top bar) to check this test against it.'));
    const ix = index(doc);
    const show = (rows) => { const n = (s) => rows.filter((r) => r.status === s).length; out.replaceChildren(h('p', {}, `${doc.title} ${doc.edition || ''}: ${n('ok')} ok · ${n('changed')} changed · ${n('missing')} missing · ${n('unlinked') + n('no-ref')} not linked`),
      h('table', {}, rows.map((r) => h('tr', {}, h('td', {}, r.id || r.item), h('td', { class: 'small' }, r.prompt), h('td', { class: cls[r.status] }, r.status, r.unresolved.length ? ` — cannot resolve ${r.unresolved.join(', ')}` : '', r.links.filter((l) => l.status !== 'ok').map((l) => ` — ${l.id} ${l.status}`).join(''))))));
    };
    box.append(h('p', { class: 'small' }, 'Check reads each item\'s cror: links against the loaded rulebook: changed means the rule\'s wording moved since the item was written; missing means the rule is gone. Link writes cror: lines from ref: lines.'),
      h('div', { class: 'row' }, h('button', { onclick: () => show(checkSource(ix, source)) }, 'Check against rulebook'), onLinked ? h('button', { onclick: () => { const r = linkSource(ix, source); onLinked(r.source); show(checkSource(ix, r.source)); } }, 'Link refs to rulebook') : null), out);
  });
  return box;
};
