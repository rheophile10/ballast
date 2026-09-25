// The TGBO: one test file addressed to every train on the sheet. See SPEC.md §5.
import { armor, dearmor } from './armor.js';
import { b64url, unb64url, hex, random, sha256, utf8 } from './bytes.js';
import { INFO, hkdfKey, openJSON, rawKey, sealJSON, shared, sidOf } from './crypto.js';
import { publicItem } from './txt.js';
import { shuffled } from './shuffle.js';

const itemsHash = async (items) => hex(await sha256(utf8(items.map((i) => i.id + '\n' + i.box).join('\n'))));

/**
 * RTC side. `rtc` = {priv, pub}; `trains` = [{pin, pub}]; `assets` = {name: {mime, b64}}.
 * Returns the armored TGBO and what the sheet must remember (id, salt, key, hash).
 */
export const issueTGBO = async (test, rtc, trains, assets = {}, rtcName = '', approval = null) => {
  const id = b64url(random(16)), saltBytes = random(16), salt = b64url(saltBytes);
  const K = random(32), Kkey = await rawKey(K);
  const items = [];
  for (const it of test.items) {
    const pub = publicItem(it);
    pub.img = pub.img.map(({ name, alt }) => {
      const a = assets[name]; if (!a) throw new Error(`asset "${name}" for item ${it.id} was not provided`);
      return { name, alt, mime: a.mime, b64: a.b64 };
    });
    const ik = await hkdfKey(K, saltBytes, INFO.item(it.id));
    items.push({ id: it.id, area: it.area || null, box: await sealJSON(ik, pub) });
  }
  const clearances = [];
  for (const [i, t] of trains.entries()) {
    const wk = await hkdfKey(await shared(rtc.priv, t.pub), saltBytes, INFO.wrap);
    clearances.push({ no: i + 1, sid: await sidOf(saltBytes, t.pin), box: await sealJSON(wk, { K: b64url(K) }) });
  }
  const hash = await itemsHash(items);
  const body = { v: 1, kind: 'tgbo', id, salt, title: test.title, settings: test.settings, areas: test.areas, rtc: rtc.pub, rtcName, approval, clearances, items, hash };
  const text = await armor('TGBO', body, { title: test.title, rtc: rtcName, items: items.length, clearances: trains.length, approved: approval ? 'yes' : 'no', complete: hash.slice(0, 4).toUpperCase() });
  return { text, record: { id, salt, hash, key: b64url(K), title: test.title } };
};

/** Train side: open a TGBO with my keypair and PIN. Returns a reader that decrypts one item at a time. */
export const copyTGBO = async (text, train, pin) => {
  const { body } = await dearmor(text, 'TGBO');
  if (await itemsHash(body.items) !== body.hash) throw new Error('TGBO does not compare: items altered');
  const saltBytes = unb64url(body.salt);
  const sid = await sidOf(saltBytes, pin);
  const wrap = body.clearances.find((w) => w.sid === sid);
  if (!wrap) throw new Error(`no clearance for CN ${pin} on this TGBO`);
  const wk = await hkdfKey(await shared(train.priv, body.rtc), saltBytes, INFO.wrap);
  const { K } = await openJSON(wk, wrap.box);
  const Kb = unb64url(K);
  const order = body.settings.shuffleItems ? shuffled(body.items.map((i) => i.id), sid) : body.items.map((i) => i.id);
  const byId = Object.fromEntries(body.items.map((i) => [i.id, i]));
  return {
    id: body.id, salt: body.salt, hash: body.hash, title: body.title, settings: body.settings, areas: body.areas, rtc: body.rtc, rtcName: body.rtcName || '', approval: body.approval || null, clearance: wrap.no, sid, order,
    complete: body.hash.slice(0, 4).toUpperCase(),
    /** Decrypt exactly one item, with its options in this train's order. */
    item: async (itemId) => {
      const it = byId[itemId]; if (!it) throw new Error(`no item ${itemId}`);
      const p = await openJSON(await hkdfKey(Kb, saltBytes, INFO.item(itemId)), it.box);
      if (body.settings.shuffleOptions && p.options?.length) p.options = shuffled(p.options, sid + itemId);
      if (p.pairs?.length) p.rights = shuffled(p.pairs.map((x) => ({ id: x.id, text: x.right })), sid + itemId + 'r');
      return p;
    },
  };
};

/** RTC side: reopen any item from the sheet's record (for review and playback). */
export const openItem = async (record, tgboBody, itemId) => {
  const saltBytes = unb64url(record.salt);
  const it = tgboBody.items.find((i) => i.id === itemId);
  return openJSON(await hkdfKey(unb64url(record.key), saltBytes, INFO.item(itemId)), it.box);
};
