// The test file: one file for the class, with a clearance for every crew member. See SPEC.md §5.
import { armor, dearmor } from './armor.js';
import { b64url, unb64url, hex, random, sha256, utf8 } from './bytes.js';
import { INFO, hkdfKey, openJSON, rawKey, sealJSON, shared, sidOf } from './crypto.js';
import { publicItem } from './txt.js';
import { shuffled } from './shuffle.js';

const itemsHash = async (items) => hex(await sha256(utf8(items.map((i) => i.id + '\n' + i.box).join('\n'))));

/**
 * RTC side. `rtc` = {priv, pub}; `trains` = [{pin, pub}]; `assets` = {name: {mime, b64}}.
 * Returns the armored test and what the sheet must remember (id, salt, key, hash).
 */
/** Default window: opens now, closes in seven days. Every test has one. */
export const defaultWindow = (now = Date.now()) => ({ from: new Date(now).toISOString(), until: new Date(now + 7 * 86400e3).toISOString() });
const checkWindow = (w) => { if (!w || Number.isNaN(Date.parse(w.from)) || Number.isNaN(Date.parse(w.until))) throw new Error('test window needs from and until'); if (Date.parse(w.until) <= Date.parse(w.from)) throw new Error('test window closes before it opens'); return { from: w.from, until: w.until }; };
export const issueTest = async (test, rtc, trains, assets = {}, rtcName = '', approval = null, window = defaultWindow()) => {
  window = checkWindow(window);
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
    const wk = await hkdfKey(await shared(rtc.priv, t.pub), saltBytes, INFO.wrapIn(window));
    clearances.push({ no: i + 1, sid: await sidOf(saltBytes, t.pin), box: await sealJSON(wk, { K: b64url(K) }) });
  }
  const hash = await itemsHash(items);
  const body = { v: 1, kind: 'test', id, salt, title: test.title, settings: test.settings, areas: test.areas, rtc: rtc.pub, rtcName, approval, window, clearances, items, hash };
  const text = await armor('TEST', body, { title: test.title, rtc: rtcName, items: items.length, clearances: trains.length, approved: approval ? 'yes' : 'no', from: window.from, until: window.until, complete: hash.slice(0, 4).toUpperCase() });
  return { text, record: { id, salt, hash, key: b64url(K), title: test.title, window } };
};

/** Crew side: open a test with my keypair and PIN. Returns a reader that decrypts one item at a time. */
export const copyTest = async (text, train, pin, at = Date.now()) => {
  const { body } = await dearmor(text, 'TEST');
  const w = checkWindow(body.window); const when = (iso) => new Date(iso).toLocaleString();
  if (at < Date.parse(w.from)) throw new Error(`This test opens at ${when(w.from)}.`);
  if (at > Date.parse(w.until)) throw new Error(`This test closed at ${when(w.until)}.`);
  if (await itemsHash(body.items) !== body.hash) throw new Error('test does not compare: items altered');
  const saltBytes = unb64url(body.salt);
  const sid = await sidOf(saltBytes, pin);
  const wrap = body.clearances.find((w) => w.sid === sid);
  if (!wrap) throw new Error(`no clearance for PIN ${pin} on this test`);
  const wk = await hkdfKey(await shared(train.priv, body.rtc), saltBytes, INFO.wrapIn(w)); // an edited window derives a different key: GCM fails
  const { K } = await openJSON(wk, wrap.box);
  const Kb = unb64url(K);
  const order = body.settings.shuffleItems ? shuffled(body.items.map((i) => i.id), sid) : body.items.map((i) => i.id);
  const byId = Object.fromEntries(body.items.map((i) => [i.id, i]));
  return {
    id: body.id, salt: body.salt, hash: body.hash, title: body.title, settings: body.settings, areas: body.areas, rtc: body.rtc, rtcName: body.rtcName || '', approval: body.approval || null, window: w, clearance: wrap.no, sid, order,
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
export const openItem = async (record, testBody, itemId) => {
  const saltBytes = unb64url(record.salt);
  const it = testBody.items.find((i) => i.id === itemId);
  return openJSON(await hkdfKey(unb64url(record.key), saltBytes, INFO.item(itemId)), it.box);
};
