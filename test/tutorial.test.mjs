// The tutorial in Chromium: a pretend desktop around the real Ballast, served over http so the frame is same-origin.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

let browser, server, base;
before(async () => {
  const root = join(tmpdir(), 'ballast-tut-' + Date.now()); mkdirSync(join(root, 'ballast'), { recursive: true }); mkdirSync(join(root, 'tutorial'), { recursive: true });
  copyFileSync(new URL('../index.html', import.meta.url).pathname, join(root, 'ballast', 'index.html')); copyFileSync(new URL('../tutorial/index.html', import.meta.url).pathname, join(root, 'tutorial', 'index.html'));
  server = createServer((req, res) => { const p = join(root, decodeURIComponent(req.url.split('?')[0])); const f = statSync(p, { throwIfNoEntry: false })?.isDirectory() ? join(p, 'index.html') : p; if (!statSync(f, { throwIfNoEntry: false })) return res.writeHead(404).end(); res.writeHead(200, { 'content-type': extname(f) === '.html' ? 'text/html' : 'application/octet-stream' }); createReadStream(f).pipe(res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

test('the whole tutorial: general, superintendent, RTC, crew — with Notepad authoring, the appeal and the hash comparison', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', (e) => errors.push(e.message)); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? (/Class name/.test(d.message()) ? 'Block C' : d.defaultValue() || 'pw') : 'pw'));
  await p.goto(base + '/tutorial/index.html'); await p.waitForSelector('text=Welcome');
  // the recommended way in: ballast.html on the shared drive, opened from a file:// address
  await p.dblclick('.dicon:has-text("Shared drive")'); await p.click('.file:has-text("ballast.html")'); await p.click('.win.explorer .openwith:has-text("Open")');
  await p.waitForSelector('iframe.app'); assert.match(await p.inputValue('.urlbar input'), /^file:.*ballast\.html$/);
  const app = p.frameLocator('iframe.app');
  const step = (title) => p.waitForSelector(`#coach h2:has-text("${title}")`, { timeout: 20000 }); // the heading, not the contents pane
  const next = () => p.click('#coach button.primary');
  const explorer = () => p.click('.task:has-text("WNR-TRAINING")');
  const openFiles = async (re, n, folder) => { await explorer(); if (folder) await p.click(`.treeitem:has-text("${folder}")`); await p.waitForSelector(`.file:has-text("${re}")`); for (let i = 0; i < n; i++) { await explorer(); await p.locator(`.file:has-text("${re}")`).nth(i).click(); await p.click('.win.explorer .openwith'); await p.waitForTimeout(400); } };
  // --- general
  await step('Free, durable'); await next(); await step('railroad metaphor'); await next();
  await step('Armored text files'); await p.dblclick('.dicon:has-text("Armored text")'); await p.waitForSelector('pre.note >> text=IT IS A GBO'); await p.click('.task:has-text("Ballast")');
  await step('How signing'); assert.ok((await p.locator('.nav li.past').count()) >= 3, 'the contents pane marks past sections');
  await p.click('.nav li.past a >> nth=0'); await p.waitForSelector('#coach .phase:has-text("re-reading")'); await p.click('#coach button:has-text("Back to where I am")'); await next();
  // --- superintendent
  await step('Register'); await app.locator('input[placeholder="Name"]').fill('Tutorial Person'); await app.locator('input[placeholder^="PIN"]').fill('555555'); await app.locator('button[type=submit]').click();
  await app.locator('text=waiting for a role').waitFor();
  await step('Mint yourself'); await app.locator('summary').click(); await app.locator('button:has-text("Start as superintendent")').click();
  await step('Start your book'); await app.locator('button:has-text("Start a book")').click(); await app.locator('text=Superintendent Tutorial').waitFor();
  await step('Mint teachers'); await p.dblclick('.dicon:has-text("Mail")'); await p.click('.msg'); await p.click('.attach .openwith'); await p.waitForTimeout(400);
  await p.dblclick('.dicon:has-text("Messages")'); await p.click('.bubble .openwith'); await p.waitForTimeout(400);
  await openFiles('registration-', 1); await app.locator('text=Registrations to mint').waitFor(); await app.locator('text=Ray Kowalczyk').first().waitFor(); await app.locator('text=Denise Okafor').first().waitFor();
  await step('Mint them'); for (let i = 0; i < 3; i++) { await app.locator('button:has-text("Mint as RTC")').first().click(); await p.waitForTimeout(300); }
  // a test written in Notepad, saved to the shared drive, opened with Ballast
  await step('in Notepad'); await p.dblclick('.dicon:has-text("Notepad")'); await p.waitForSelector('.noteedit'); await p.fill('.noteedit', (await p.inputValue('.noteedit')).replace('My first test', 'Signals warm-up'));
  await p.click('.notebar button:has-text("Save as")'); await p.waitForSelector('.file:has-text("my-test.txt")', { timeout: 5000 }).catch(() => {});
  await openFiles('my-test', 1, 'Tests'); await app.locator('text=Signals warm-up').first().waitFor();
  await step('in Ballast'); await next();
  await step('Sign tests'); await openFiles('test1', 1, 'Tests'); await openFiles('test2', 1, 'Tests');
  await app.locator('.tabs >> text=Test inventory').click(); for (let i = 0; i < 3; i++) { await app.locator('button:has-text("Approve")').first().click(); await p.waitForTimeout(300); }
  await step('Class profiles come in'); await openFiles('class-profile-', 3);
  await step('Read the appraisals');
  await app.locator('.tabs >> text=Reports').click(); await app.locator('button:has-text("Test 1")').first().click(); await app.locator('text=RTC appraisal').waitFor();
  const table = await app.locator('table').first().textContent(); assert.match(table, /nose|jokes|ok|Steady/);
  await app.locator('button:has-text("back")').click(); await next();
  await step('An appeal'); await openFiles('release-Gordon', 1);
  await app.locator('text=DIFFERS').first().waitFor(); const audits = await app.locator('h2:has-text("Audits") + p + table').textContent(); assert.match(audits, /123461/); assert.match(audits, /DIFFERS/);
  await step('Can a teacher fail'); await next();
  await step('step down'); await openFiles('profile-RTC-you', 1);
  // --- rtc
  await step('Start a sheet'); await app.locator('button:has-text("Start a sheet")').click(); await app.locator('text=RTC Tutorial').waitFor();
  await step('Mint students'); await openFiles('registration-', 4); await app.locator('text=Registrations to mint').waitFor();
  for (let i = 0; i < 4; i++) { await app.locator('button:has-text("Mint as crew")').first().click(); await p.waitForTimeout(300); }
  await step('Disseminate'); await openFiles('approval-', 1); await openFiles('test2', 1);
  await app.locator('.tabs >> text=Tests').click(); await app.locator('text=approved by').waitFor(); await app.locator('button:has-text("Issue test")').click();
  await step('Receive returns'); await openFiles('release-', 4);
  await app.locator('.tabs >> text=Releases').click(); await app.locator('button:has-text("Score")').click(); await app.locator('text=released ·').waitFor();
  const rows = await app.locator('table').first().textContent(); assert.doesNotMatch(rows, /unsigned|MISMATCH/);
  await step('Mark, rate, appraise'); await next();
  await step('Pass out grades'); await openFiles('profile-superintendent', 1);
  await app.locator('.tabs >> text=Releases').click(); await app.locator('button:has-text("Cancel all")').click(); await p.waitForTimeout(600); await explorer(); await p.click('.treeitem:has-text("Outbox")'); await p.waitForSelector('.file:has-text("cancellations-")'); await p.click('.task:has-text("Ballast")');
  await app.locator('button:has-text("Class profile to")').click();
  await step('Step down again'); await openFiles('profile-crew-you', 1);
  // --- crew
  await step('What protects the test'); await next();
  await step('Do a test'); await openFiles('.test.txt', 1);
  await app.locator('text=Rule 136').waitFor(); await app.locator('text=the superintendent over your RTC').waitFor();
  const complete = await app.locator('.complete b').textContent(); const nItems = Number((await app.locator('text=/\\d+ items/').first().textContent()).match(/(\d+) items/)[1]);
  await app.locator('input[placeholder^="Repeat"]').fill(complete.toLowerCase()); await app.locator('text=Repeat and enter fullscreen').click();
  const canvas = app.locator('canvas[data-hits]'); await canvas.waitFor();
  const hits = async () => JSON.parse(await canvas.getAttribute('data-hits'));
  const clickHit = async (hh) => { const box = await canvas.boundingBox(); const sx = box.width / 900; await p.mouse.click(box.x + (hh.x + 10) * sx, box.y + (hh.y + 10) * sx); await p.waitForTimeout(60); };
  for (let i = 0; i < nItems; i++) {
    await p.waitForTimeout(150); const hs = await hits();
    if (hs.some((x) => x.kind === 'option')) await clickHit(hs.find((x) => x.kind === 'option'));
    else if (hs.some((x) => x.kind === 'left')) { for (const l of hs.filter((x) => x.kind === 'left')) { await clickHit(l); await clickHit((await hits()).find((x) => x.kind === 'right')); } }
    else if (await app.locator('textarea').isVisible()) await app.locator('textarea').fill('both crew members verify their copy, the designation and the engine number');
    if (i < nItems - 1) await app.locator('text=Next').click();
  }
  await app.locator('text=Release track').click(); await app.locator('text=Track released').waitFor();
  const shown = await app.locator('.card .complete').first().textContent(); assert.match(shown, /^[0-9a-f]{64}$/);
  await app.locator('text=Download release').click(); await step('Your release hash'); await app.locator('text=Done').click(); await next();
  await step('Receive feedback'); await openFiles('cancel-', 1);
  await app.locator('text=Does it compare?').waitFor(); const prov = await app.locator('.card:has-text("Does it compare?")').textContent();
  assert.match(prov, /YES — these marks are for the file you released/); assert.match(prov, /your RTC \(the one who minted you\)/); assert.ok(prov.includes(shown), 'the cancellation names the release hash shown at release time');
  await step('Does it compare'); await next(); await step('Exercises and the rulebook'); await next(); await p.waitForSelector('#coach p.done:has-text("The end")');
  assert.deepEqual(errors, []); await ctx.close();
});
