// The program director: approves test sources (a signature anyone can check) and reads teachers' reports.
import { armor, dearmor } from './armor.js';
import { unb64url, utf8 } from './bytes.js';
import { INFO, hkdfKey, openJSON, sealJSON, shared } from './crypto.js';
import { signBytes, sourceHash, verifyBytes } from './profile.js';
import { parseTest, publicItem } from './txt.js';
import { sha256, hex } from './bytes.js';

/** APPROVAL: {hash, title, by (superintendent's sign key), pub (their ECDH key, so releases can carry an audit copy), signature over "ballast/approval/1\n<hash>"}. Public; travels with the test. */
/** What a crew member can recompute after decrypting an item: its public form, images by name only. Canonical JSON, hashed. */
export const itemHash = async (it) => { const p = publicItem(it); const canon = { id: p.id, type: p.type, prompt: p.prompt, options: p.options || [], pairs: p.pairs || [], svg: p.svg || null, img: (p.img || []).map((i) => ({ name: i.name, alt: i.alt || '' })), worth: p.worth || 1, area: p.area || null }; return hex(await sha256(utf8(JSON.stringify(canon)))); };
const itemsRoot = (items) => Object.keys(items).sort().map((id) => `${id}:${items[id]}`).join('\n');
export const approveSource = async (director, source, title) => {
  const hash = await sourceHash(source);
  const { test, errors } = await parseTest(source); if (errors.length) throw new Error(`cannot approve: ${errors[0]}`);
  const items = {}; for (const it of test.items) items[it.id] = await itemHash(it);
  const signature = await signBytes(director.sign, utf8(`ballast/approval/2\n${hash}\n${itemsRoot(items)}`));
  return armor('APPROVAL', { v: 2, kind: 'approval', hash, items, title, by: director.sig, pub: director.pub, name: director.name, signature }, { title, hash: hash.slice(0, 12), by: director.name });
};
export const readApproval = async (text) => (await dearmor(text, 'APPROVAL')).body;
/** Does this approval cover this source, and is the signature good? */
export const checkApproval = async (approval, source) =>
  (await sourceHash(source)) === approval.hash && checkApprovalSignature(approval);
/** The signature alone (no source in hand): what a crew member checks, with the superintendent's key from their mint. */
export const checkApprovalSignature = (approval) => approval?.v === 2 && !!approval.items && verifyBytes(approval.by, approval.signature, utf8(`ballast/approval/2\n${approval.hash}\n${itemsRoot(approval.items)}`));

/** REPORT: a teacher's summary of one administration, sealed to the director. No questions, no answers. */
export const sendReport = async (teacher, directorPub, report) => {
  const salt = unb64url(report.test); // the test id doubles as the HKDF salt for its report
  const key = await hkdfKey(await shared(teacher.priv, directorPub), salt, INFO.report);
  return armor('REPORT', { v: 1, kind: 'report', test: report.test, teacher: teacher.pub, box: await sealJSON(key, report) }, { title: report.title, teacher: teacher.name, trains: report.rows.length });
};
export const takeReport = async (text, director) => {
  const { body } = await dearmor(text, 'REPORT');
  const key = await hkdfKey(await shared(director.priv, body.teacher), unb64url(body.test), INFO.report);
  return { teacher: body.teacher, report: await openJSON(key, body.box) };
};
