// The standalone reader page: the CROR 2025 built in, any other document by file, notes kept in this browser.
import { renderReader } from '../../src/reader/ui.js';
import cror from '../../documents/cror-2025.json';

const key = (doc) => `reader-notes:${doc.id}`;
const load = (doc) => { try { return JSON.parse(localStorage.getItem(key(doc)) || '[]'); } catch { return []; } };
const save = (doc, notes) => { try { localStorage.setItem(key(doc), JSON.stringify(notes)); } catch { /* private window: notes live for the session only */ } };
const root = document.getElementById('root');
const show = (doc) => renderReader(root, { doc, notes: load(doc), onNotes: (n) => save(doc, n), onDocument: show, at: location.hash.slice(1) || null });
show(cror);
