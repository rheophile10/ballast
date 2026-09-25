// DOM as data: h(tag, attrs, ...children). Text is always a text node — there is no innerHTML anywhere.
export const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value' || (k in el && typeof v !== 'string')) el[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};
export const mount = (root, ...nodes) => { root.replaceChildren(...nodes.flat(Infinity).filter(Boolean)); return root; };
import { hostDownload } from '../embed.js';
export const download = (name, content, type = 'text/plain') => {
  if (hostDownload(name, content, type)) return;
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
export const readFileText = (file) => file.text();
export const readFileBytes = async (file) => new Uint8Array(await file.arrayBuffer());
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
