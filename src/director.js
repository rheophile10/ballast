// The program director: approves test sources (a signature anyone can check) and reads teachers' reports.
import { armor, dearmor } from './armor.js';
import { unb64url, utf8 } from './bytes.js';
import { INFO, hkdfKey, openJSON, sealJSON, shared } from './crypto.js';
import { signBytes, sourceHash, verifyBytes } from './profile.js';

/** APPROVAL: {hash, title, by (superintendent's sign key), pub (their ECDH key, so releases can carry an audit copy), signature over "ballast/approval/1\n<hash>"}. Public; travels with the test. */
export const approveSource = async (director, source, title) => {
  const hash = await sourceHash(source);
  const signature = await signBytes(director.sign, utf8(`ballast/approval/1\n${hash}`));
  return armor('APPROVAL', { v: 1, kind: 'approval', hash, title, by: director.sig, pub: director.pub, name: director.name, signature }, { title, hash: hash.slice(0, 12), by: director.name });
};
export const readApproval = async (text) => (await dearmor(text, 'APPROVAL')).body;
/** Does this approval cover this source, and is the signature good? */
export const checkApproval = async (approval, source) =>
  (await sourceHash(source)) === approval.hash && verifyBytes(approval.by, approval.signature, utf8(`ballast/approval/1\n${approval.hash}`));

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
