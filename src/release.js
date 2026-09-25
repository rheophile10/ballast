// The track release: a crew member's attempt, sealed to the RTC, signed by the crew member, with an audit copy
// sealed to the superintendent who approved the test. See SPEC.md §6.
import { armor, dearmor } from './armor.js';
import { unb64url, utf8 } from './bytes.js';
import { INFO, hkdfKey, openJSON, sealJSON, shared } from './crypto.js';
import { signBytes, verifyBytes } from './profile.js';

const signed = (test, box) => utf8(`ballast/release/1\n${test}\n${box}`);

/** Crew side. `test` is the reader from copyTest; `attempt` is the log + answers. */
export const giveRelease = async (test, crew, pin, attempt) => {
  const salt = unb64url(test.salt);
  const key = await hkdfKey(await shared(crew.priv, test.rtc), salt, INFO.spike);
  const box = await sealJSON(key, attempt);
  const sup = test.approval?.pub || null; // the approving superintendent can open the audit copy, nobody else
  const audit = sup ? { pub: sup, box: await sealJSON(await hkdfKey(await shared(crew.priv, sup), salt, INFO.audit), attempt) } : null;
  const body = { v: 1, kind: 'release', test: test.id, salt: test.salt, hash: test.hash, source: test.approval?.hash || null, sid: test.sid, pin: String(pin), train: crew.pub,
    box, audit, sig: crew.sig || null, signature: crew.sign ? await signBytes(crew.sign, signed(test.id, box)) : null };
  return armor('RELEASE', body, { title: test.title, train: `CN ${pin}`, answered: Object.keys(attempt.answers || {}).length, finished: attempt.finished ? new Date(attempt.finished).toISOString() : '' });
};

/** The crew member's signature over the sealed attempt: true, false, or null when the file carries none. */
export const checkRelease = async (body, sigPub = body.sig) => (body.signature && sigPub ? verifyBytes(sigPub, body.signature, signed(body.test, body.box)) : null);

/** RTC side. `record` is the sheet's entry for this test; `sigPub` is the crew member's sign key from the roster. Returns {pin, train, attempt, hash, signed, late}. */
export const takeRelease = async (text, rtc, record, sigPub) => {
  const { body, headers } = await dearmor(text, 'RELEASE');
  if (body.test !== record.id) throw new Error('release is for a different test');
  if (body.hash !== record.hash) throw new Error('release does not compare: test hash differs');
  const key = await hkdfKey(await shared(rtc.priv, body.train), unb64url(record.salt), INFO.spike);
  const attempt = await openJSON(key, body.box); // GCM failure here = not from this train, or tampered
  const late = !!(record.window && attempt.finished && attempt.finished > Date.parse(record.window.until));
  return { pin: body.pin, sid: body.sid, train: body.train, attempt, hash: headers.sha256, signed: await checkRelease(body, sigPub || body.sig), late };
};

/** Superintendent side: open the audit copy of a release for a test they approved. Returns {pin, train, attempt, hash, source, test, signed}. */
export const auditRelease = async (text, superintendent) => {
  const { body, headers } = await dearmor(text, 'RELEASE');
  if (!body.audit) throw new Error('this release carries no audit copy (the test was not approved)');
  if (body.audit.pub !== superintendent.pub) throw new Error('the audit copy is sealed to a different superintendent');
  const key = await hkdfKey(await shared(superintendent.priv, body.train), unb64url(body.salt), INFO.audit);
  const attempt = await openJSON(key, body.audit.box);
  return { pin: body.pin, train: body.train, attempt, hash: headers.sha256, source: body.source, test: body.test, signed: await checkRelease(body) };
};
