// The cancellation: the RTC returns the marks to one crew member, signed, naming the release it marks. See SPEC.md §7.
import { armor, dearmor } from './armor.js';
import { unb64url, utf8 } from './bytes.js';
import { INFO, hkdfKey, openJSON, sealJSON, shared } from './crypto.js';
import { signBytes, verifyBytes } from './profile.js';

const signed = (test, release, box) => utf8(`ballast/cancel/1\n${test}\n${release || ''}\n${box}`);

/**
 * RTC side. `result` is from scoreAttempt; `release` is {hash, answers} of the release being marked, so the crew member
 * can check that what was marked is what they released. Per-item marks travel (id, got, worth, ref); keys do not.
 */
export const cancelTest = async (record, rtc, trainPub, pin, result, release = {}) => {
  const key = await hkdfKey(await shared(rtc.priv, trainPub), unb64url(record.salt), INFO.plate);
  const { perItem, ...rest } = result;
  const items = (perItem || []).map(({ id, area, ref, worth, got, pending }) => ({ id, area, ref, worth, got, pending }));
  const box = await sealJSON(key, { title: record.title, pin: String(pin), ...rest, items, answers: release.answers || null, release: release.hash || null, marked: Date.now() });
  const body = { v: 1, kind: 'cancel', test: record.id, salt: record.salt, pin: String(pin), rtc: rtc.pub, release: release.hash || null, by: rtc.sig || null,
    signature: rtc.sign ? await signBytes(rtc.sign, signed(record.id, release.hash, box)) : null, box };
  return armor('CANCEL', body, { title: record.title, train: `CN ${pin}`, grade: `${Math.round(result.grade * 100)}%`, release: (release.hash || '').slice(0, 16) });
};

/** Crew side. Returns the marks plus provenance: release (hash marked), by (RTC sign key), signed (signature good?). */
export const readCancel = async (text, train) => {
  const { body } = await dearmor(text, 'CANCEL');
  const key = await hkdfKey(await shared(train.priv, body.rtc), unb64url(body.salt), INFO.plate);
  const marks = await openJSON(key, body.box);
  const ok = body.signature && body.by ? await verifyBytes(body.by, body.signature, signed(body.test, body.release, body.box)) : null;
  return { ...marks, release: body.release || null, by: body.by || null, signed: ok };
};
