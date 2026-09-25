// The track release: a train's attempt, sealed to the RTC. See SPEC.md §6.
import { armor, dearmor } from './armor.js';
import { unb64url } from './bytes.js';
import { INFO, hkdfKey, openJSON, sealJSON, shared } from './crypto.js';

/** Train side. `tgbo` is the object from copyTGBO; `attempt` is the log + answers. */
export const giveRelease = async (tgbo, train, pin, attempt) => {
  const key = await hkdfKey(await shared(train.priv, tgbo.rtc), unb64url(tgbo.salt), INFO.spike);
  const body = { v: 1, kind: 'release', tgbo: tgbo.id, hash: tgbo.hash, sid: tgbo.sid, pin: String(pin), train: train.pub, box: await sealJSON(key, attempt) };
  return armor('RELEASE', body, { title: tgbo.title, train: `CN ${pin}`, answered: Object.keys(attempt.answers || {}).length });
};

/** RTC side. `record` is the sheet's entry for this TGBO. Returns {pin, train, attempt}. */
export const takeRelease = async (text, rtc, record) => {
  const { body } = await dearmor(text, 'RELEASE');
  if (body.tgbo !== record.id) throw new Error('release is for a different TGBO');
  if (body.hash !== record.hash) throw new Error('release does not compare: TGBO hash differs');
  const key = await hkdfKey(await shared(rtc.priv, body.train), unb64url(record.salt), INFO.spike);
  const attempt = await openJSON(key, body.box); // GCM failure here = not from this train, or tampered
  return { pin: body.pin, sid: body.sid, train: body.train, attempt };
};
