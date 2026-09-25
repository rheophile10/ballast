// Documents (rulebooks) and notes kept in this browser. A document arrives as a JSON file (SPEC §11).
import * as store from './store.js';
export const saveDocument = async (doc) => { const ids = (await store.get('docs')) || []; if (!ids.includes(doc.id)) await store.set('docs', [...ids, doc.id]); await store.set('doc:' + doc.id, doc); return doc; };
export const documents = async () => { const out = []; for (const id of (await store.get('docs')) || []) { const d = await store.get('doc:' + id); if (d) out.push(d); } return out; };
/** A document by id, or the first one loaded. */
export const getDocument = async (id) => (id ? (await store.get('doc:' + id)) || null : (await documents())[0] || null);
export const getNotes = async (id) => (await store.get('notes:' + id)) || [];
export const setNotes = (id, notes) => store.set('notes:' + id, notes);
