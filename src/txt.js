// The test source format. See SPEC.md §10. Pure: string in, {test, errors} out.
import { hex, sha256, utf8 } from './bytes.js';

const DUR = { s: 1, m: 60, h: 3600 };
const parseTime = (s) => {
  const m = /^(\d+)\s*([smh])?$/i.exec(s.trim());
  if (!m) throw new Error(`bad time "${s}" (use 90m, 5400s, 1h)`);
  return Number(m[1]) * DUR[(m[2] || 'm').toLowerCase()];
};
const parsePct = (s) => { const n = parseFloat(s); return s.includes('%') ? n / 100 : n > 1 ? n / 100 : n; };
const parseAreas = (s) => s.split('·').map((a) => a.trim()).filter(Boolean).map((a) => {
  const m = /^(\S+)\s*(?:"([^"]*)")?$/.exec(a);
  if (!m) throw new Error(`bad area "${a}"`);
  return { id: m[1], label: m[2] || m[1] };
});

const KEYS = new Set(['id', 'type', 'area', 'ref', 'lcr', 'tags', 'svg', 'img', 'alt', 'worth', 'cror']);

/** @returns {Promise<{test: object, errors: string[]}>} */
export const parseTest = async (source) => {
  const errors = [];
  const blocks = source.replace(/\r\n/g, '\n').split(/\n---+\n/);
  const head = blocks.shift() || '';
  const test = { title: 'Untitled test', settings: { time: 3600, pass: 0.9, shuffleItems: true, shuffleOptions: true, allowBack: false }, areas: [], items: [] };
  for (const line of head.split('\n')) {
    const l = line.trim(); if (!l) continue;
    if (l.startsWith('#')) { test.title = l.replace(/^#+\s*/, ''); continue; }
    const i = l.indexOf(':'); if (i < 0) { errors.push(`header: "${l}" is not key: value`); continue; }
    const k = l.slice(0, i).trim().toLowerCase(), v = l.slice(i + 1).trim();
    try {
      if (k === 'time') test.settings.time = parseTime(v);
      else if (k === 'pass') test.settings.pass = parsePct(v);
      else if (k === 'shuffle') { test.settings.shuffleItems = /items/.test(v); test.settings.shuffleOptions = /options/.test(v); }
      else if (k === 'back') test.settings.allowBack = /^(yes|true|on)$/i.test(v);
      else if (k === 'cror') test.settings.openBook = /^(open|yes|true|on)$/i.test(v); // the rulebook may be consulted during the test
      else if (k === 'areas') test.areas = parseAreas(v);
      else errors.push(`header: unknown key "${k}"`);
    } catch (e) { errors.push(`header: ${e.message}`); }
  }
  const areaIds = new Set(test.areas.map((a) => a.id));
  const seen = new Set();
  for (const [n, block] of blocks.entries()) {
    if (!block.trim()) continue;
    const item = { type: 'mc', prompt: '', options: [], pairs: [], key: null, answer: '', ref: [], cror: [], tags: [], img: [], worth: 1 };
    let mode = null; // 'q' while the prompt continues
    for (const raw of block.split('\n')) {
      const line = raw.trimEnd();
      if (!line.trim()) { mode = null; continue; }
      let m;
      if ((m = /^Q:\s?(.*)$/.exec(line))) { item.prompt = m[1]; mode = 'q'; continue; }
      if ((m = /^(\*?)([a-z])\)\s?(.*)$/.exec(line))) { item.options.push({ id: m[2], text: m[3] }); if (m[1]) item.key = m[2]; mode = null; continue; }
      if ((m = /^L:\s?(.*?)\s*=\s*(.*)$/.exec(line))) { item.pairs.push({ id: String.fromCharCode(97 + item.pairs.length), left: m[1], right: m[2] }); mode = null; continue; }
      if ((m = /^A:\s?(.*)$/.exec(line))) { item.answer = m[1]; mode = null; continue; }
      if ((m = /^([a-z]+):\s?(.*)$/i.exec(line)) && KEYS.has(m[1].toLowerCase())) {
        const k = m[1].toLowerCase(), v = m[2].trim();
        if (k === 'ref') item.ref.push(...v.split(/\s*[,;]\s*|\s+(?=CROR|GOI|GR)/).filter(Boolean));
        else if (k === 'tags') item.tags.push(...v.split(/\s+/).filter(Boolean));
        else if (k === 'cror') item.cror.push(...v.split(/[\s,;]+/).filter(Boolean)); // node@hash links into the rulebook (SPEC §11)
        else if (k === 'img') item.img.push({ name: v, alt: '' });
        else if (k === 'alt') { if (item.img.length) item.img[item.img.length - 1].alt = v; else errors.push(`item ${n + 1}: alt: before img:`); }
        else if (k === 'worth') item.worth = Number(v) || 1;
        else item[k] = v;
        mode = null; continue;
      }
      if (mode === 'q') { item.prompt += '\n' + line; continue; }
      errors.push(`item ${n + 1}: cannot read line "${line}"`);
    }
    if (!item.prompt) errors.push(`item ${n + 1}: no Q:`);
    if (item.type === 'mc' && item.options.length < 2) errors.push(`item ${n + 1}: mc needs at least two options`);
    if (item.type === 'mc' && !item.key) errors.push(`item ${n + 1}: mc has no * key`);
    if (item.type === 'match') { if (item.pairs.length < 2) errors.push(`item ${n + 1}: match needs at least two L: pairs`); item.worth = item.pairs.length; }
    if (item.type === 'short' && !item.answer) errors.push(`item ${n + 1}: short has no A: model answer`);
    if (!['mc', 'match', 'short'].includes(item.type)) errors.push(`item ${n + 1}: unknown type "${item.type}"`);
    if (item.area && areaIds.size && !areaIds.has(item.area)) errors.push(`item ${n + 1}: area "${item.area}" not in areas:`);
    if (!item.id) item.id = 'q' + hex(await sha256(utf8(item.prompt + item.type))).slice(0, 8);
    if (seen.has(item.id)) errors.push(`item ${n + 1}: duplicate id "${item.id}"`); seen.add(item.id);
    test.items.push(item);
  }
  if (!test.items.length) errors.push('no items (separate items with --- lines)');
  return { test, errors };
};

/** Strip everything a student must not see. */
/** What the crew member's copy carries: never the key or model answer, never where the answer lives. */
export const publicItem = ({ key, answer, ref, cror, lcr, tags, ...rest }) => rest;
