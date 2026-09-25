// The track release: a crew member's attempt, sealed to the RTC. See SPEC.md §6.
import { armor, dearmor } from './armor.js';
import { unb64url } from './bytes.js';
import { INFO, hkdfKey, openJSON, sealJSON, shared } from './crypto.js';

/** Train side. `test` is the object from copyTest; `attempt` is the log + answers. */
export const giveRelease = async (test, crew, pin, attempt) => {
  const key = await hkdfKey(await shared(crew.priv, test.rtc), unb64url(test.salt), INFO.spike);
  const body = { v: 1, kind: 'release', test: test.id, hash: test.hash, sid: test.sid, pin: String(pin), train: crew.pub, box: await sealJSON(key, attempt) };
  return armor('RELEASE', body, { title: test.title, train: `CN ${pin}`, answered: Object.keys(attempt.answers || {}).length });
};

/** RTC side. `record` is the sheet's entry for this test. Returns {pin, train, attempt}. */
export const takeRelease = async (text, rtc, record) => {
  const { body } = await dearmor(text, 'RELEASE');
  if (body.test !== record.id) throw new Error('release is for a different test');
  if (body.hash !== record.hash) throw new Error('release does not compare: test hash differs');
  const key = await hkdfKey(await shared(rtc.priv, body.train), unb64url(record.salt), INFO.spike);
  const attempt = await openJSON(key, body.box); // GCM failure here = not from this train, or tampered
  return { pin: body.pin, sid: body.sid, train: body.train, attempt };
};
