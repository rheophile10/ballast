// The whole exchange in Chromium over file://: register → issue → copy → work (fullscreen) → release → score → cancel → read.
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

const page = async () => { const ctx = await browser.newContext({ acceptDownloads: true }); const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? (d.message().includes('passphrase') ? 'pw' : 'ABC') : undefined)); await p.goto(INDEX); return { p, errors, ctx }; };
const paste = async (p, text) => { await p.fill('textarea', text); await p.click('text=Open pasted text'); };
const downloadText = async (p, trigger) => { const [d] = await Promise.all([p.waitForEvent('download'), trigger()]); return readFileSync(await d.path(), 'utf8'); };

test('the exchange, end to end', async () => {
  // --- train registers
  const t = await page();
  await t.p.click('text=Register crew');
  await t.p.fill('input[placeholder="Name"]', 'Alice Test'); await t.p.fill('input[placeholder^="PIN"]', '123456');
  const [badge] = await Promise.all([t.p.waitForEvent('download'), t.p.click('text=Make my badge')]);
  assert.match(badge.suggestedFilename(), /badge-CN123456\.png/);
  await t.p.waitForSelector('text=Badge downloaded');
  const crewText = await t.p.inputValue('textarea');
  assert.match(crewText, /BEGIN BALLAST CREW/);

  // --- RTC opens a desk, takes the crew, loads the source, issues
  const r = await page();
  await r.p.click('text=Open the desk');
  await r.p.waitForSelector('text=RTC ABC');
  await r.p.fill('textarea', crewText); await r.p.click('text=Take');
  await r.p.waitForSelector('text=CN 123456');
  const src = readFileSync(new URL('../examples/test3.txt', import.meta.url), 'utf8').replace(/\nimg:.*\nalt:.*\n/, '\n'); // no raster in this run
  await r.p.setInputFiles('input[type=file]', { name: 'test3.txt', mimeType: 'text/plain', buffer: Buffer.from(src) });
  await r.p.waitForSelector('text=4 items');
  const tgbo = await downloadText(r.p, () => r.p.click('text=Issue TGBO'));
  assert.match(tgbo, /BEGIN BALLAST TGBO/);
  await r.p.waitForSelector('text=issued');

  // --- train copies the TGBO, repeats, works it in fullscreen
  await t.p.click('text=Done');
  await paste(t.p, tgbo);
  await t.p.waitForSelector('text=Rule 136');
  const complete = await t.p.textContent('.complete b');
  await t.p.fill('input[placeholder^="Repeat"]', complete.toLowerCase());
  await t.p.click('text=Repeat and enter fullscreen');
  await t.p.waitForSelector('canvas[data-hits]');
  assert.ok(await t.p.evaluate(() => !!document.fullscreenElement), 'the test runs fullscreen');
  const hits = async () => JSON.parse(await t.p.getAttribute('canvas', 'data-hits'));
  const clickHit = async (hh) => { const box = await t.p.locator('canvas').boundingBox(); const sx = box.width / 900; await t.p.mouse.click(box.x + (hh.x + 10) * sx, box.y + (hh.y + 10) * sx); await t.p.waitForTimeout(50); };
  for (let i = 0; i < 4; i++) {
    await t.p.waitForTimeout(150);
    const hs = await hits();
    if (hs.some((x) => x.kind === 'option')) await clickHit(hs.find((x) => x.kind === 'option'));
    else if (hs.some((x) => x.kind === 'left')) { for (const l of hs.filter((x) => x.kind === 'left')) { await clickHit(l); const rr = (await hits()).find((x) => x.kind === 'right'); await clickHit(rr); } }
    else if (await t.p.isVisible('textarea')) await t.p.fill('textarea', 'both crew have a copy');
    if (i < 3) await t.p.click('text=Next');
  }
  // a break: the tab goes hidden, then the train resumes
  await t.p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await t.p.waitForSelector('text=Rule 35');
  await t.p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
  await t.p.click('text=Resume in fullscreen');
  await t.p.keyboard.press('Control+C'); await t.p.waitForSelector('text=Copying is not permitted');
  const release = await downloadText(t.p, async () => { await t.p.click('text=Release track'); await t.p.waitForSelector('text=Track released'); await t.p.click('text=Download release'); });
  assert.match(release, /BEGIN BALLAST RELEASE/);

  // --- RTC scores, marks the short answer, cancels, saves the sheet
  await r.p.fill('textarea', release); await r.p.click('text=Take');
  await r.p.waitForSelector('text=release CN 123456');
  await r.p.click('.tabs >> text=Releases'); await r.p.click('text=Score');
  await r.p.waitForSelector('text=1 released');
  const row = await r.p.textContent('table tr:nth-child(2)');
  assert.match(row, /CN 123456/); assert.match(row, /\(\+1 unmarked\)/); assert.match(row, /1ok|1\s*ok/);
  await r.p.click('text=review'); await r.p.waitForSelector('text=Playback');
  await r.p.fill('input[type=number]', '1'); await r.p.press('input[type=number]', 'Tab');
  await r.p.click('text=← back');
  assert.doesNotMatch(await r.p.textContent('table tr:nth-child(2)'), /unmarked/);
  const plate = await downloadText(r.p, () => r.p.click('text=cancel (send marks)'));
  assert.match(plate, /BEGIN BALLAST CANCEL/);
  const sheet = await downloadText(r.p, () => r.p.click('text=Save sheet'));
  assert.match(sheet, /BEGIN BALLAST SHEET/);
  writeFileSync(join(dir, 'sheet.bed'), sheet); writeFileSync(join(dir, 'release.spike'), release); writeFileSync(join(dir, 'test3.txt'), src);

  // --- train reads the cancellation
  await t.p.click('text=Done');
  await paste(t.p, plate);
  await t.p.waitForSelector('text=By area');
  assert.match(await t.p.textContent('.big'), /\d+% — /);
  await t.p.waitForSelector('text=Read these');
  assert.deepEqual(t.errors, []); assert.deepEqual(r.errors, []);
  await t.ctx.close(); await r.ctx.close();
  console.log('artifacts in', dir);
});
