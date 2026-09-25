// One profile shape for every role: name, PIN, photo, and two public keys (ECDH to seal, ECDSA to sign).
// It travels only as armored text; the photo rides inside as a small base64 JPEG.
import { armor, dearmor } from './armor.js';
import { b64url, unb64url, sha256, utf8 } from './bytes.js';

const subtle = crypto.subtle;
const ECDH = { name: 'ECDH', namedCurve: 'P-256' }, ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
export const ROLES = ['crew', 'rtc', 'superintendent'];

/** Make a profile. Keys are non-extractable unless `extractable` (teacher/director keep theirs in their passphrase file). */
export const makeProfile = async (role, name, pin, photo = '', extractable = false) => {
  if (!ROLES.includes(role)) throw new Error(`bad role ${role}`);
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN must be 4–8 digits');
  const kx = await subtle.generateKey(ECDH, extractable, ['deriveBits']);
  const ks = await subtle.generateKey(ECDSA, extractable, ['sign', 'verify']);
  return { role, name: String(name).trim(), pin: String(pin).trim(), photo,
    pub: b64url(new Uint8Array(await subtle.exportKey('raw', kx.publicKey))), sig: b64url(new Uint8Array(await subtle.exportKey('raw', ks.publicKey))),
    priv: kx.privateKey, sign: ks.privateKey };
};
export const publicProfile = ({ role, name, pin, pub, sig, photo }) => ({ role, name, pin, pub, sig, photo });
export const profileText = (p) => armor('PROFILE', { v: 1, kind: 'profile', ...publicProfile(p) }, { role: p.role, name: p.name, pin: p.pin });
export const readProfile = async (t) => { const { body } = await dearmor(t, 'PROFILE'); if (!ROLES.includes(body.role)) throw new Error('bad role'); if (!/^\d{4,8}$/.test(body.pin)) throw new Error('bad PIN'); return body; };

/** Export/import private halves for the passphrase files. */
export const exportKeys = async (p) => ({ priv: await subtle.exportKey('jwk', p.priv), sign: await subtle.exportKey('jwk', p.sign) });
export const importKeys = async (p, jwks) => ({ ...p, priv: await subtle.importKey('jwk', jwks.priv, ECDH, true, ['deriveBits']), sign: await subtle.importKey('jwk', jwks.sign, ECDSA, true, ['sign']) });

/** Signatures: ECDSA P-256 / SHA-256 over bytes. Anyone with the signer's `sig` key can check. */
export const signBytes = async (signKey, bytes) => b64url(new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signKey, bytes)));
export const verifyBytes = async (sigPub, signature, bytes) => {
  const k = await subtle.importKey('raw', unb64url(sigPub), ECDSA, true, ['verify']);
  return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, unb64url(signature), bytes);
};
export const sourceHash = async (source) => Array.from(await sha256(utf8(source.replace(/\r\n/g, '\n')))).map((b) => b.toString(16).padStart(2, '0')).join('');
