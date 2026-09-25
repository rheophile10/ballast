// ASCII armor: the envelope every Ballast file travels in. See SPEC.md §1.
import { b64, unb64, hex, sha256, utf8, text } from './bytes.js';

const KINDS = ['PROFILE', 'TEST', 'RELEASE', 'CANCEL', 'SHEET', 'BOOK', 'APPROVAL', 'REPORT'];
const wrap76 = (s) => s.replace(/(.{76})/g, '$1\n').trim();

/** @param {string} kind @param {object} body @param {Record<string,string|number>} [headers] */
export const armor = async (kind, body, headers = {}) => {
  const bytes = utf8(JSON.stringify(body));
  const lines = [`-----BEGIN BALLAST ${kind}-----`, 'version: 1'];
  for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
  lines.push(`sha256: ${hex(await sha256(bytes))}`, '', wrap76(b64(bytes)), `-----END BALLAST ${kind}-----`, '');
  return lines.join('\n');
};

/** Find and open the first armored block in `s` (which may be a whole email). */
export const dearmor = async (s, expectKind) => {
  const m = /-----BEGIN BALLAST ([A-Z]+)-----\r?\n([\s\S]*?)-----END BALLAST \1-----/.exec(s);
  if (!m) throw new Error('not a Ballast file');
  const [, kind, inner] = m;
  if (!KINDS.includes(kind)) throw new Error(`unknown kind ${kind}`);
  if (expectKind && kind !== expectKind) throw new Error(`expected a ${expectKind}, got a ${kind}`);
  const [head, ...rest] = inner.split(/\r?\n\r?\n/);
  const headers = Object.fromEntries(head.split(/\r?\n/).filter(Boolean).map((l) => {
    const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
  if (headers.version !== '1') throw new Error(`unsupported version ${headers.version}`);
  const bytes = unb64(rest.join(''));
  if (hex(await sha256(bytes)) !== headers.sha256) throw new Error('corrupt file: sha256 mismatch');
  const body = JSON.parse(text(bytes));
  if (body.kind !== kind.toLowerCase()) throw new Error('armor kind does not match body');
  return { kind, headers, body };
};

/** Every armored block in a text, in order: a bundle is just blocks concatenated (or an email with several attachments pasted in). */
export const blocks = (s) => (s.match(/-----BEGIN BALLAST ([A-Z]+)-----\r?\n[\s\S]*?-----END BALLAST \1-----/g) || []);
export const bundle = (texts) => texts.join('\n');
export const sniff = (s) => (/-----BEGIN BALLAST ([A-Z]+)-----/.exec(s) || [])[1] || null;
