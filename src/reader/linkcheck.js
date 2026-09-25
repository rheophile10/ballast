// Tie test items to the rulebook and see what moved. Pure functions over a test source (SPEC §10) and a document index.
import { resolve, checkLink } from './doc.js';

const CITE = /^(ref):\s*(.+)$/im;
const refsOf = (line) => line.split(/\s*[,;]\s*|\s+(?=CROR|GOI|GR)/).filter(Boolean);

/** Rewrite the source so every item with a `ref:` line carries a `cror:` line of node@hash links (existing cror: lines are replaced). */
export const linkSource = (ix, source) => {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n---+\n/); const report = [];
  const out = blocks.map((block, i) => {
    if (i === 0) return block;
    const lines = block.split('\n').filter((l) => !/^cror:/i.test(l));
    const refLine = lines.find((l) => CITE.test(l)); if (!refLine) { report.push({ item: i, refs: [], links: [], unresolved: [] }); return lines.join('\n'); }
    const refs = refsOf(refLine.replace(/^ref:\s*/i, '')); const links = [], unresolved = [];
    for (const r of refs) { const id = resolve(ix, r); if (id) links.push(`${id}@${ix.get(id).hash}`); else unresolved.push(r); }
    report.push({ item: i, refs, links, unresolved });
    if (!links.length) return lines.join('\n');
    const at = lines.indexOf(refLine); lines.splice(at + 1, 0, `cror: ${links.join(' ')}`); return lines.join('\n');
  });
  return { source: out.join('\n---\n'), report };
};

/** For each item: its links and their state against this document — ok | changed | missing — plus refs that never linked. */
export const checkSource = (ix, source) => {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n---+\n/).slice(1); const rows = [];
  blocks.forEach((block, i) => {
    if (!block.trim()) return;
    const q = (block.match(/^Q:\s?(.*)$/m) || [])[1] || ''; const idLine = (block.match(/^id:\s*(\S+)/m) || [])[1] || null;
    const links = (block.match(/^cror:\s*(.+)$/im) || [])[1]?.split(/[\s,;]+/).filter(Boolean) || [];
    const refs = (block.match(/^ref:\s*(.+)$/im) || [])[1] ? refsOf(block.match(/^ref:\s*(.+)$/im)[1]) : [];
    const checks = links.map((l) => checkLink(ix, l)); const unresolved = refs.filter((r) => !resolve(ix, r));
    const status = !links.length ? (refs.length ? 'unlinked' : 'no-ref') : checks.some((c) => c.status === 'missing') ? 'missing' : checks.some((c) => c.status === 'changed') ? 'changed' : 'ok';
    rows.push({ item: i + 1, id: idLine, prompt: q.slice(0, 80), refs, links: checks, unresolved, status });
  });
  return rows;
};
