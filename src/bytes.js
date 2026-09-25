// Byte helpers. Plain ES2020, no dependencies. base64url has no padding.
export const utf8 = (s) => new TextEncoder().encode(s);
export const text = (b) => new TextDecoder().decode(b);

const B64 = typeof btoa === 'function'
  ? { enc: (bin) => btoa(bin), dec: (s) => atob(s) }
  : { enc: (bin) => Buffer.from(bin, 'binary').toString('base64'), dec: (s) => Buffer.from(s, 'base64').toString('binary') };

export const b64 = (bytes) => B64.enc(Array.from(bytes, (c) => String.fromCharCode(c)).join(''));
export const unb64 = (s) => Uint8Array.from(B64.dec(s.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
export const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return unb64(t + '='.repeat((4 - (t.length % 4)) % 4));
};
export const hex = (bytes) => Array.from(bytes, (c) => c.toString(16).padStart(2, '0')).join('');
export const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
export const random = (n) => crypto.getRandomValues(new Uint8Array(n));
export const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
