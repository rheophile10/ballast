// One profile shape for every role: name, PIN, photo, and two public keys (ECDH to seal, ECDSA to sign).
// It travels only as armored text; the photo rides inside as a small base64 JPEG.
import { armor, dearmor } from './armor.js';
import { b64url, unb64url, sha256, utf8 } from './bytes.js';

const subtle = crypto.subtle;
const ECDH = { name: 'ECDH', namedCurve: 'P-256' }, ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
export const ROLES = ['crew', 'rtc', 'superintendent'];
const ROLE_OR_NONE = [...ROLES, 'none'];

/** Make a profile. Keys are non-extractable unless `extractable` (teacher/director keep theirs in their passphrase file). */
export const makeProfile = async (role, name, pin, photo = '', extractable = false) => {
  if (!ROLE_OR_NONE.includes(role)) throw new Error(`bad role ${role}`);
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN must be 4–8 digits');
  const kx = await subtle.generateKey(ECDH, extractable, ['deriveBits']);
  const ks = await subtle.generateKey(ECDSA, extractable, ['sign', 'verify']);
  return { role, name: String(name).trim(), pin: String(pin).trim(), photo,
    pub: b64url(new Uint8Array(await subtle.exportKey('raw', kx.publicKey))), sig: b64url(new Uint8Array(await subtle.exportKey('raw', ks.publicKey))),
    priv: kx.privateKey, sign: ks.privateKey };
};
export const publicProfile = ({ role, name, pin, pub, sig, photo, minted }) => ({ role, name, pin, pub, sig, photo, ...(minted ? { minted } : {}) });
export const profileText = (p) => armor('PROFILE', { v: 1, kind: 'profile', ...publicProfile(p) }, { role: p.role, name: p.name, pin: p.pin });
export const readProfile = async (t) => { const { body } = await dearmor(t, 'PROFILE'); if (!ROLE_OR_NONE.includes(body.role)) throw new Error('bad role'); if (!/^\d{4,8}$/.test(body.pin)) throw new Error('bad PIN'); if (body.role !== 'none' && !(await checkMint(body))) throw new Error(`${body.name}'s ${body.role} role is not properly minted`); return body; };

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

// ---------- minting: a role is granted by signature. Superintendents are self-minted (root); superintendents
// mint RTCs; RTCs mint crew. A minted profile carries who granted it, when, and the signature.
export const MINTS_BY = { crew: 'rtc', rtc: 'superintendent', superintendent: 'superintendent' };
const mintString = (p, role, start, by) => `ballast/mint/1\n${role}\n${start}\n${p.pin}\n${p.pub}\n${p.sig}\n${by.sig}`;
/** `minter` has a sign key and a role allowed to grant `role`. Returns the minted public profile. */
export const mintProfile = async (minter, profile, role, start = new Date().toISOString().slice(0, 10)) => {
  if (!ROLES.includes(role)) throw new Error(`bad role ${role}`);
  if (minter.role !== MINTS_BY[role]) throw new Error(`a ${minter.role} cannot mint ${role}`);
  const by = { name: minter.name, pin: minter.pin, sig: minter.sig, role: minter.role };
  const signature = await signBytes(minter.sign, utf8(mintString(profile, role, start, by)));
  return { ...publicProfile(profile), role, minted: { role, start, by, signature } };
};
/** Is this profile's role genuinely granted? Checks the signature and the role chain (not who the minter is). */
export const checkMint = async (p) => {
  const m = p.minted; if (!m || m.role !== p.role || !ROLES.includes(p.role)) return false;
  if (m.by.role !== MINTS_BY[p.role]) return false;
  if (p.role === 'superintendent' && m.by.sig !== p.sig) return false; // root is self-signed
  return verifyBytes(m.by.sig, m.signature, utf8(mintString(p, p.role, m.start, m.by)));
};
/** An unminted registration: role "none" until someone mints it. */
export const registration = (p) => ({ ...publicProfile(p), role: 'none' });
