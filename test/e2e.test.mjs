// Minting chain and the whole exchange in Chromium over file://.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

const INDEX = pathToFileURL(new URL('../index.html', import.meta.url).pathname).href;
let browser; const dir = mkdtempSync(join(tmpdir(), 'ballast-e2e-'));
before(async () => { browser = await chromium.launch({ args: ['--allow-file-access-from-files'] }); });
after(async () => { await browser?.close(); });

const page = async () => { const ctx = await browser.newContext({ acceptDownloads: true }); const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'pw' : undefined)); await p.goto(INDEX); return { p, errors, ctx }; };
const dl = async (p, trigger) => { const [d] = await Promise.all([p.waitForEvent('download'), trigger()]); return readFileSync(await d.path(), 'utf8'); };
const register = async (p, name, pin) => { await p.fill('input[placeholder="Name"]', name); await p.fill('input[placeholder^="PIN"]', pin); await p.click('button[type=submit]'); await p.waitForSelector('text=waiting for a role'); return p.inputValue('textarea[readonly]'); };
const take = async (p, text) => { await p.fill('textarea[placeholder^="Or paste"]', text); await p.click('text=Take'); };
const accept = async (p, text) => { await p.fill('textarea[placeholder^="Drop or paste the profile"]', text); await p.click('button:has-text("Open")'); };
const src = readFileSync(new URL('../samples/test3-block-c.txt', import.meta.url), 'utf8').replace(/\nimg:.*\nalt:.*\n/, '\n');

test('minting chain, then the exchange', async () => {
  // --- everyone registers; nobody has a role
  const s = await page(), r = await page(), c = await page();
  const supReg = await register(s.p, 'Sup Erintendent', '900001'); assert.match(supReg, /role: none/);
  const rtcReg = await register(r.p, 'RTC ABC', '777777');
  const crewReg = await register(c.p, 'Alice Test', '123456');
  // a registration is not a role: the crew page stays on "waiting"; a forged role is refused
  await accept(c.p, rtcReg); await c.p.waitForSelector('text=not for the keys in this browser');

  // --- superintendent self-mints, starts a book, mints the RTC
  await s.p.click('summary'); await s.p.click('button:has-text("Start as superintendent")'); await s.p.waitForSelector('text=Superintendent');
  await s.p.waitForSelector('text=superintendent since'); await s.p.click('button:has-text("Start a book")'); await s.p.waitForSelector('text=Superintendent Sup');
  const supProfile = await dl(s.p, () => s.p.click('button:has-text("Download profile")'));
  await take(s.p, rtcReg); await s.p.waitForSelector('text=registration from RTC ABC');
  const rtcProfile = await dl(s.p, () => s.p.click('button:has-text("Mint as RTC")')); assert.match(rtcProfile, /role: rtc/);
  await s.p.setInputFiles('input[type=file][multiple]', { name: 'test3.txt', mimeType: 'text/plain', buffer: Buffer.from(src) });
  await s.p.click('.tabs >> text=Test inventory'); await s.p.waitForSelector('text=not approved');
  const approval = await dl(s.p, () => s.p.click('button:has-text("Approve")'));

  // --- RTC accepts the minted profile, starts a sheet, mints the crew, issues
  await accept(r.p, rtcProfile); await r.p.waitForSelector('text=rtc since'); await r.p.click('button:has-text("Start a sheet")'); await r.p.waitForSelector('text=RTC RTC ABC');
  await take(r.p, crewReg); await r.p.waitForSelector('text=registration from Alice');
  const crewProfile = await dl(r.p, () => r.p.click('button:has-text("Mint as crew")')); assert.match(crewProfile, /role: crew/);
  await take(r.p, supProfile); await r.p.waitForSelector('text=superintendent Sup');
  await take(r.p, approval); await r.p.waitForSelector('text=approval for');
  await r.p.setInputFiles('input[type=file][multiple]', { name: 'test3.txt', mimeType: 'text/plain', buffer: Buffer.from(src) });
  await r.p.waitForSelector('text=4 items'); await r.p.waitForSelector('text=approved by Sup');
  const testText = await dl(r.p, () => r.p.click('button:has-text("Issue test")')); assert.match(testText, /BEGIN BALLAST TEST/); assert.match(testText, /approved: yes/);

  // --- crew accepts the minted profile; the home is a checklist; copies the test, works it, releases
  await accept(c.p, crewProfile); await c.p.waitForSelector('text=crew since'); await c.p.waitForSelector('text=1. Copy the test');
  await c.p.fill('textarea[placeholder^="Drop or paste a test"]', testText); await c.p.click('button:has-text("Open")');
  await c.p.waitForSelector('text=Rule 136'); await c.p.waitForSelector('text=Approved by Sup');
  const complete = await c.p.textContent('.complete b');
  await c.p.fill('input[placeholder^="Repeat"]', complete.toLowerCase()); await c.p.click('text=Repeat and enter fullscreen');
  await c.p.waitForSelector('canvas[data-hits]'); assert.ok(await c.p.evaluate(() => !!document.fullscreenElement));
  const hits = async () => JSON.parse(await c.p.getAttribute('canvas', 'data-hits'));
  const clickHit = async (hh) => { const box = await c.p.locator('canvas').boundingBox(); const sx = box.width / 900; await c.p.mouse.click(box.x + (hh.x + 10) * sx, box.y + (hh.y + 10) * sx); await c.p.waitForTimeout(60); };
  for (let i = 0; i < 4; i++) {
    await c.p.waitForTimeout(150); const hs = await hits();
    if (hs.some((x) => x.kind === 'option')) await clickHit(hs.find((x) => x.kind === 'option'));
    else if (hs.some((x) => x.kind === 'left')) { for (const l of hs.filter((x) => x.kind === 'left')) { await clickHit(l); await clickHit((await hits()).find((x) => x.kind === 'right')); } }
    else if (await c.p.isVisible('textarea')) await c.p.fill('textarea', 'both crew have a copy');
    if (i < 3) await c.p.click('text=Next');
  }
  await c.p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await c.p.waitForSelector('text=Rule 35'); await c.p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); }); await c.p.click('text=Resume in fullscreen');
  await c.p.keyboard.press('Control+C'); await c.p.waitForSelector('text=Copying is not permitted');
  const release = await dl(c.p, async () => { await c.p.click('text=Release track'); await c.p.waitForSelector('text=Track released'); await c.p.click('text=Download release'); });
  await c.p.click('text=Done'); await c.p.waitForSelector('text=3. Read your cancellation');

  // --- RTC scores, marks, cancels, reports, saves
  await take(r.p, release); await r.p.waitForSelector('text=release CN 123456');
  await r.p.click('.tabs >> text=Releases'); await r.p.click('button:has-text("Score")'); await r.p.waitForSelector('text=1 released');
  const row = await r.p.textContent('table tr:nth-child(2)'); assert.match(row, /CN 123456/); assert.match(row, /unmarked/); assert.match(row, /ok/);
  await r.p.click('button:has-text("review")'); await r.p.waitForSelector('text=Playback'); await r.p.fill('input[type=number]', '1'); await r.p.press('input[type=number]', 'Tab'); await r.p.click('text=← back');
  const plate = await dl(r.p, () => r.p.click('button:has-text("cancel (send marks)")')); assert.match(plate, /BEGIN BALLAST CANCEL/);
  const report = await dl(r.p, () => r.p.click('button:has-text("Class profile to Sup")')); assert.match(report, /BEGIN BALLAST REPORT/);
  const sheet = await dl(r.p, () => r.p.click('button:has-text("Save sheet")')); assert.match(sheet, /BEGIN BALLAST SHEET/);
  writeFileSync(join(dir, 'sheet.txt'), sheet); writeFileSync(join(dir, 'release.txt'), release); writeFileSync(join(dir, 'test3.txt'), src);

  // --- crew reads marks; superintendent reads the report
  await c.p.fill('textarea[placeholder^="Drop or paste a test"]', plate); await c.p.click('button:has-text("Open")');
  await c.p.waitForSelector('text=By area'); assert.match(await c.p.textContent('.big'), /\d+% — /);
  await take(s.p, report); await s.p.waitForSelector('text=report: Test 3');
  await s.p.click('.tabs >> text=Reports'); const adm = await s.p.textContent('table'); assert.match(adm, /Test 3/); assert.match(adm, /RTC ABC/); assert.match(adm, /yes/);
  assert.deepEqual(c.errors, []); assert.deepEqual(r.errors, []); assert.deepEqual(s.errors, []);
  await c.ctx.close(); await r.ctx.close(); await s.ctx.close();
  console.log('artifacts in', dir);
});


