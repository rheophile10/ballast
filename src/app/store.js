// What the browser keeps: the train's identity (non-extractable key) and the attempt in progress.
import { embedded } from '../embed.js';
const DB = embedded() ? 'ballast-embedded' : 'ballast', VER = 1; // an embedded (tutorial) Ballast never touches the real profile
const db = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, VER);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', mode); const q = fn(t.objectStore('kv')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
export const get = (k) => tx('readonly', (s) => s.get(k));
export const set = (k, v) => tx('readwrite', (s) => s.put(v, k));
export const del = (k) => tx('readwrite', (s) => s.delete(k));
