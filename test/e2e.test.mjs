// Three roles in Chromium over file://: superintendent approves; RTC issues; crew copies, works, releases; RTC scores, reports; superintendent reads.
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
const register = async (p, name, pin) => { await p.fill('input[placeholder="Name"]', name); await p.fill('input[placeholder^="PIN"]', pin); await p.click('button[type=submit]'); };
const take = async (p, text) => { await p.fill('textarea[placeholder^="Or paste"]', text); await p.click('text=Take'); };
const src = readFileSync(new URL('../examples/test3.txt', import.meta.url), 'utf8').replace(/\nimg:.*\nalt:.*\n/, '\n');

test('three roles, end to end', async () => {
  // --- superintendent registers and approves the source
  const s = await page();
  await s.p.click('.rolecard >> text=Superintendent'); await s.p.click('button:has-text("Register and start a book")');
  await register(s.p, 'Sup Erintendent', '900001'); await s.p.waitForSelector('text=Superintendent Sup');
  const supProfile = await s.p.inputValue('textarea[readonly]').catch(() => null) || await dl(s.p, () => s.p.click('text=Download profile'));
  await s.p.setInputFiles('input[type=file][multiple]', { name: 'test3.txt', mimeType: 'text/plain', buffer: Buffer.from(src) });
  await s.p.waitForSelector('text=not approved');
  const approval = await dl(s.p, () => s.p.click('button:has-text("Approve")'));
  assert.match(approval, /BEGIN BALLAST APPROVAL/);

  // --- crew registers
  const c = await page();
  await c.p.click('.rolecard >> text=Crew'); await c.p.click('button:has-text("Register")');
  await register(c.p, 'Alice Test', '123456'); await c.p.waitForSelector('text=Registered');
  const crewProfile = await c.p.inputValue('textarea[readonly]');
  assert.match(crewProfile, /BEGIN BALLAST PROFILE/);
  await c.p.click('text=Done'); await c.p.waitForSelector('text=2. Send your profile');

  // --- RTC registers, takes crew + superintendent + approval + source, issues
  const r = await page();
  await r.p.click('.rolecard >> text=RTC'); await r.p.click('button:has-text("Register and start a sheet")');
  await register(r.p, 'RTC ABC', '777777'); await r.p.waitForSelector('text=RTC RTC ABC');
  await take(r.p, crewProfile); await r.p.waitForSelector('text=crew CN 123456');
  await take(r.p, supProfile); await r.p.waitForSelector('text=superintendent Sup');
  await take(r.p, approval); await r.p.waitForSelector('text=approval for');
  await r.p.setInputFiles('input[type=file][multiple]', { name: 'test3.txt', mimeType: 'text/plain', buffer: Buffer.from(src) });
  await r.p.waitForSelector('text=4 items'); await r.p.waitForSelector('text=approved by Sup');
  const tgbo = await dl(r.p, () => r.p.click('button:has-text("Issue TGBO")'));
  assert.match(tgbo, /BEGIN BALLAST TGBO/); assert.match(tgbo, /approved: yes/);

  // --- crew copies, repeats, works in fullscreen, releases
  await c.p.click('nav >> text=switch role'); await c.p.fill('textarea', tgbo); await c.p.click('text=Open');
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
  await c.p.click('text=Done'); await c.p.waitForSelector('text=5. Read your cancellation');

  // --- RTC scores, marks, cancels, reports
  await take(r.p, release); await r.p.waitForSelector('text=release CN 123456');
  await r.p.click('.tabs >> text=Releases'); await r.p.click('button:has-text("Score")'); await r.p.waitForSelector('text=1 released');
  const row = await r.p.textContent('table tr:nth-child(2)'); assert.match(row, /CN 123456/); assert.match(row, /unmarked/); assert.match(row, /ok/);
  await r.p.click('button:has-text("review")'); await r.p.waitForSelector('text=Playback'); await r.p.fill('input[type=number]', '1'); await r.p.press('input[type=number]', 'Tab'); await r.p.click('text=← back');
  assert.doesNotMatch(await r.p.textContent('table tr:nth-child(2)'), /unmarked/);
  const plate = await dl(r.p, () => r.p.click('button:has-text("cancel (send marks)")')); assert.match(plate, /BEGIN BALLAST CANCEL/);
  const report = await dl(r.p, () => r.p.click('button:has-text("Report to Sup")')); assert.match(report, /BEGIN BALLAST REPORT/);
  const sheet = await dl(r.p, () => r.p.click('button:has-text("Save sheet")')); assert.match(sheet, /BEGIN BALLAST SHEET/);
  writeFileSync(join(dir, 'sheet.txt'), sheet); writeFileSync(join(dir, 'release.txt'), release); writeFileSync(join(dir, 'test3.txt'), src);

  // --- crew reads marks
  await c.p.fill('textarea', plate).catch(async () => { await c.p.click('nav >> text=switch role'); await c.p.fill('textarea', plate); });
  await c.p.click('text=Open'); await c.p.waitForSelector('text=By area'); assert.match(await c.p.textContent('.big'), /\d+% — /);

  // --- superintendent takes the RTC's profile and the report
  await r.p.click('nav >> text=switch role'); // (just to make sure nothing breaks)
  await s.p.waitForSelector('text=Superintendent Sup');
  await take(s.p, report); await s.p.waitForSelector('text=report: Test 3');
  await s.p.click('.tabs >> text=Reports'); await s.p.waitForSelector('text=Administrations');
  const adm = await s.p.textContent('table'); assert.match(adm, /Test 3/); assert.match(adm, /yes/);
  assert.deepEqual(c.errors, []); assert.deepEqual(r.errors, []); assert.deepEqual(s.errors, []);
  await c.ctx.close(); await r.ctx.close(); await s.ctx.close();
  console.log('artifacts in', dir);
});

test('practice runs without an RTC and marks itself', async () => {
  const c = await page();
  await c.p.click('.rolecard >> text=Crew'); await c.p.click('button:has-text("Register")'); await register(c.p, 'Bob', '654321'); await c.p.waitForSelector('text=Registered'); await c.p.click('text=Done');
  await c.p.click('text=Start practice'); await c.p.waitForSelector('text=PRAC');
  await c.p.fill('input[placeholder^="Repeat"]', 'prac'); await c.p.click('text=Repeat and enter fullscreen'); await c.p.waitForSelector('canvas[data-hits]');
  await c.p.click('text=Release track'); await c.p.waitForSelector('text=Practice — not for record');
  await c.p.waitForSelector('text=Read these'); assert.deepEqual(c.errors, []); await c.ctx.close();
});
