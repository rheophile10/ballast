// All cryptography, all WebCrypto. See SPEC.md §2–3.
import { b64url, unb64url, concat, random, sha256, utf8, text } from './bytes.js';

const subtle = crypto.subtle;
const EC = { name: 'ECDH', namedCurve: 'P-256' };

/** Generate an identity. `extractable` false for students (the browser keeps it), true for the BED. */
export const keypair = async (extractable = false) => {
  const kp = await subtle.generateKey(EC, extractable, ['deriveBits']);
  return { priv: kp.privateKey, pub: b64url(new Uint8Array(await subtle.exportKey('raw', kp.publicKey))) };
};
export const importPub = (pub) => subtle.importKey('raw', unb64url(pub), EC, true, []);
export const exportPriv = (priv) => subtle.exportKey('jwk', priv);
export const importPriv = (jwk, extractable = true) => subtle.importKey('jwk', jwk, EC, extractable, ['deriveBits']);

/** ECDH shared bits between my private key and their public key (base64url). */
export const shared = async (priv, theirPub) =>
  new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: await importPub(theirPub) }, priv, 256));

/** HKDF-SHA-256(ikm, salt, info) → AES-256-GCM key. */
export const hkdfKey = async (ikm, salt, info) => {
  const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) }, k,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
};
export const rawKey = (bytes) => subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

/** PBKDF2 passphrase → AES-256-GCM key (BED). */
export const passKey = async (passphrase, salt, iterations = 600_000) => {
  const k = await subtle.importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, k,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
};

/** A box is base64url(nonce ‖ ciphertext‖tag). */
export const seal = async (key, plaintextBytes) => {
  const nonce = random(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintextBytes));
  return b64url(concat(nonce, ct));
};
export const open = async (key, box) => {
  const all = unb64url(box);
  try {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12)));
  } catch { throw new Error('cannot open: wrong key or tampered data'); }
};
export const sealJSON = (key, obj) => seal(key, utf8(JSON.stringify(obj)));
export const openJSON = async (key, box) => JSON.parse(text(await open(key, box)));

/** sid = base64url(SHA-256(salt ‖ pin)[0:16]) — a student's handle inside one test. */
export const sidOf = async (salt, pin) => b64url((await sha256(concat(salt, utf8(String(pin).trim())))).slice(0, 16));

export const INFO = {
  wrap: 'ballast/wrap/1', spike: 'ballast/spike/1', plate: 'ballast/plate/1', item: (id) => `ballast/item/1/${id}`,
};
