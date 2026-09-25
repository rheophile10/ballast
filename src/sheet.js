// The RTC's train sheet: everything the RTC holds, under a passphrase. See SPEC.md §8.
import { armor, dearmor } from './armor.js';
import { b64url, random, unb64url } from './bytes.js';
import { openJSON, passKey, sealJSON } from './crypto.js';
import { exportKeys, importKeys, makeProfile } from './profile.js';

/** A sheet (teacher) or a book (director) is the same shape under a different armor kind. */
export const newSheet = async (profile) => ({ rtc: profile, trains: [], tests: [], releases: [], marks: {}, approvals: [], reports: [], sources: [], pending: [] });
export const newBook = newSheet;

export const saveSheet = async (sheet, passphrase, kind = 'SHEET') => {
  const salt = random(16), iter = 600_000;
  const key = await passKey(passphrase, salt, iter);
  const { priv, sign, ...pub } = sheet.rtc;
  const plain = { ...sheet, rtc: { ...pub, keys: await exportKeys(sheet.rtc) } };
  const body = { v: 1, kind: kind.toLowerCase(), kdf: { salt: b64url(salt), iter }, box: await sealJSON(key, plain) };
  return armor(kind, body, { name: sheet.rtc.name, role: sheet.rtc.role, trains: sheet.trains.length, tests: sheet.tests.length });
};
export const saveBook = (book, passphrase) => saveSheet(book, passphrase, 'BOOK');

export const openSheet = async (text, passphrase, kind = 'SHEET') => {
  const { body } = await dearmor(text, kind);
  const key = await passKey(passphrase, unb64url(body.kdf.salt), body.kdf.iter);
  const plain = await openJSON(key, body.box).catch(() => { throw new Error('wrong passphrase'); });
  const { keys, ...p } = plain.rtc; plain.rtc = await importKeys(p, keys);
  return plain;
};
export const openBook = (text, passphrase) => openSheet(text, passphrase, 'BOOK');
