// The RTC's train sheet: everything the RTC holds, under a passphrase. See SPEC.md §8.
import { armor, dearmor } from './armor.js';
import { b64url, random, unb64url } from './bytes.js';
import { exportPriv, importPriv, keypair, openJSON, passKey, sealJSON } from './crypto.js';

export const newSheet = async (name) => {
  const kp = await keypair(true);
  return { rtc: { name, pub: kp.pub, priv: kp.priv }, trains: [], tgbos: [], releases: [], marks: {} };
};

export const saveSheet = async (sheet, passphrase) => {
  const salt = random(16), iter = 600_000;
  const key = await passKey(passphrase, salt, iter);
  const plain = { ...sheet, rtc: { name: sheet.rtc.name, pub: sheet.rtc.pub, priv: await exportPriv(sheet.rtc.priv) } };
  const body = { v: 1, kind: 'sheet', kdf: { salt: b64url(salt), iter }, box: await sealJSON(key, plain) };
  return armor('SHEET', body, { rtc: sheet.rtc.name, trains: sheet.trains.length, tgbos: sheet.tgbos.length });
};

export const openSheet = async (text, passphrase) => {
  const { body } = await dearmor(text, 'SHEET');
  const key = await passKey(passphrase, unb64url(body.kdf.salt), body.kdf.iter);
  const plain = await openJSON(key, body.box).catch(() => { throw new Error('wrong passphrase'); });
  plain.rtc.priv = await importPriv(plain.rtc.priv, true);
  return plain;
};
