// The cancellation: the RTC returns the marks to one train. See SPEC.md §7.
import { armor, dearmor } from './armor.js';
import { unb64url } from './bytes.js';
import { INFO, hkdfKey, openJSON, sealJSON, shared } from './crypto.js';

/** RTC side. `result` is from scoreAttempt; nothing in it names a question or an answer. */
export const cancelTGBO = async (record, rtc, trainPub, pin, result) => {
  const key = await hkdfKey(await shared(rtc.priv, trainPub), unb64url(record.salt), INFO.plate);
  const { perItem, ...rest } = result;
  const body = { v: 1, kind: 'cancel', tgbo: record.id, pin: String(pin), rtc: rtc.pub,
    box: await sealJSON(key, { title: record.title, pin: String(pin), ...rest }) };
  return armor('CANCEL', body, { title: record.title, train: `CN ${pin}`, grade: `${Math.round(result.grade * 100)}%` });
};

/** Train side. */
export const readCancel = async (text, train, tgboSalt) => {
  const { body } = await dearmor(text, 'CANCEL');
  const key = await hkdfKey(await shared(train.priv, body.rtc), unb64url(tgboSalt), INFO.plate);
  return openJSON(key, body.box);
};
