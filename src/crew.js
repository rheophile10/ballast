// Crew registration: a train tells the RTC who it is. See SPEC.md §4.
// Travels two ways: as armored text (paste into a message) and inside a PNG badge (tEXt chunk).
import { armor, dearmor } from './armor.js';
import { utf8, text as decodeText } from './bytes.js';

export const registerCrew = (name, pin, pub) => armor('CREW', { v: 1, kind: 'crew', name, pin: String(pin), pub }, { train: `CN ${pin}`, name });
export const readCrew = async (t) => { const { body } = await dearmor(t, 'CREW'); if (!/^\d{4,8}$/.test(body.pin)) throw new Error('bad PIN'); return body; };

// --- PNG tEXt chunk in/out, no dependencies ---
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u32 = (n) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const chunk = (type, data) => { const t = utf8(type); const td = new Uint8Array(t.length + data.length); td.set(t); td.set(data, t.length); const out = new Uint8Array(12 + data.length); out.set(u32(data.length)); out.set(td, 4); out.set(u32(crc32(td)), 8 + data.length); return out; };

/** Insert a tEXt chunk (keyword "ballast") after IHDR. Returns new PNG bytes. */
export const badgeWrite = (png, crewText) => {
  const data = new Uint8Array([...utf8('ballast'), 0, ...utf8(crewText)]);
  const c = chunk('tEXt', data);
  const ihdrEnd = 8 + 12 + 13; // signature + IHDR chunk
  const out = new Uint8Array(png.length + c.length); out.set(png.slice(0, ihdrEnd)); out.set(c, ihdrEnd); out.set(png.slice(ihdrEnd), ihdrEnd + c.length);
  return out;
};
/** Find the ballast tEXt chunk; null if the PNG was re-encoded and lost it. */
export const badgeRead = (png) => {
  let p = 8;
  while (p + 8 <= png.length) {
    const len = (png[p] << 24 | png[p + 1] << 16 | png[p + 2] << 8 | png[p + 3]) >>> 0;
    const type = decodeText(png.slice(p + 4, p + 8));
    if (type === 'tEXt') { const d = png.slice(p + 8, p + 8 + len); const z = d.indexOf(0); if (decodeText(d.slice(0, z)) === 'ballast') return decodeText(d.slice(z + 1)); }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return null;
};
