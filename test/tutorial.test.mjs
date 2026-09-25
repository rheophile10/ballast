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

test('the whole tutorial: superintendent, RTC, crew — with the appeal and the hash comparison', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', (e) => errors.push(e.message)); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Block C' : 'pw'));
  await p.goto(base + '/tutorial/index.html'); await p.waitForSelector('text=Welcome');
  // the recommended way in: ballast.html on the shared drive, opened from a file:// address
  await p.dblclick('.dicon:has-text("Shared drive")'); await p.click('.file:has-text("ballast.html")'); await p.click('.openwith:has-text("Open")');
  await p.waitForSelector('iframe.app'); assert.match(await p.inputValue('.urlbar input'), /^file:.*ballast\.html$/);
  const app = p.frameLocator('iframe.app');
  const step = (title) => p.waitForSelector(`#coach >> text=${title}`, { timeout: 20000 });
  const next = () => p.click('#coach button.primary');
  await step('Shared drive or cror.ca'); await next();
  const openFiles = async (re, n) => { await p.waitForSelector(`.file:has-text("${re}")`); for (let i = 0; i < n; i++) { await p.click('.task:has-text("CN-TRAINING")'); await p.locator(`.file:has-text("${re}")`).nth(i).click(); await p.click('.openwith'); await p.waitForTimeout(400); } }; // opening a file brings the browser forward, so refocus the explorer from the taskbar each time
  // --- the three explanations, then registration
  await step('railroad metaphor'); await next(); await step('Built for function'); await next(); await step('armored text file'); await next(); await step('Low-permission IT'); await next();
  await step('Register'); await app.locator('input[placeholder="Name"]').fill('Tutorial Person'); await app.locator('input[placeholder^="PIN"]').fill('555555'); await app.locator('button[type=submit]').click();
  await app.locator('text=waiting for a role').waitFor();
  await step('mints themself'); await app.locator('summary').click(); await app.locator('button:has-text("Start as superintendent")').click();
  await step('Start your book'); await app.locator('button:has-text("Start a book")').click(); await app.locator('text=Superintendent Tutorial').waitFor();
  await step('Three RTCs'); await openFiles('registration-', 3); await app.locator('text=Registrations to mint').waitFor();
  await step('Mint them'); for (let i = 0; i < 3; i++) { await app.locator('button:has-text("Mint as RTC")').first().click(); await p.waitForTimeout(300); }
  await step('Tests arrive'); await openFiles('test1', 1); await openFiles('test2', 1);
  await app.locator('.tabs >> text=Test inventory').click(); for (let i = 0; i < 2; i++) { await app.locator('button:has-text("Approve")').first().click(); await p.waitForTimeout(300); }
  await step('Write one yourself'); await next();
  await step('Class profiles come in'); await openFiles('class-profile-', 3);
  await step('Read the appraisals');
  await app.locator('.tabs >> text=Reports').click(); await app.locator('button:has-text("Test 1")').first().click(); await app.locator('text=RTC appraisal').waitFor();
  const table = await app.locator('table').first().textContent(); assert.match(table, /nose|jokes|ok|Steady/);
  await app.locator('button:has-text("back")').click(); await next();
  // --- the appeal: Gordon's release re-scored from its audit copy differs from Kowalczyk's class profile
  await step('An appeal'); await openFiles('release-Gordon', 1);
  await app.locator('text=DIFFERS').first().waitFor(); const audits = await app.locator('h2:has-text("Audits") + p + table').textContent(); assert.match(audits, /123461/); assert.match(audits, /DIFFERS/);
  await step('Can an RTC fail'); await next();
  // --- demotion to RTC
  await step('step down'); await openFiles('profile-RTC-you', 1);
  await step('You are an RTC'); await app.locator('button:has-text("Start a sheet")').click(); await app.locator('text=RTC Tutorial').waitFor();
  await step('Registrations from crew'); await openFiles('registration-', 4); await app.locator('text=Registrations to mint').waitFor();
  for (let i = 0; i < 4; i++) { await app.locator('button:has-text("Mint as crew")').first().click(); await p.waitForTimeout(300); }
  await step('A test from the superintendent'); await openFiles('approval-', 1); await openFiles('test2', 1);
  await app.locator('.tabs >> text=Tests').click(); await app.locator('text=approved by').waitFor(); await app.locator('button:has-text("Issue test")').click();
  await step('Releases come back'); await openFiles('release-', 4);
  await app.locator('.tabs >> text=Releases').click(); await app.locator('button:has-text("Score")').click(); await app.locator('text=released ·').waitFor();
  const rows = await app.locator('table').first().textContent(); assert.doesNotMatch(rows, /unsigned|MISMATCH/);
  await step('Mark, rate, appraise'); await next();
  await step('Cancel and file'); await openFiles('profile-superintendent', 1);
  await app.locator('.tabs >> text=Releases').click(); await app.locator('button:has-text("Cancel all")').click(); await p.waitForTimeout(500);
  await app.locator('button:has-text("Class profile to")').click();
  await step('Step down again'); await openFiles('profile-CN-you', 1);
  // --- crew
  await step('What protects the test'); await next();
  await step('You are crew'); await openFiles('.test.txt', 1);
  await app.locator('text=Rule 136').waitFor(); await app.locator('text=Window:').waitFor();
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
  await step('Your marks'); await openFiles('cancel-', 1);
  await app.locator('text=Does it compare?').waitFor(); const prov = await app.locator('.card:has-text("Does it compare?")').textContent();
  assert.match(prov, /YES — these marks are for the file you released/); assert.match(prov, /your RTC \(the one who minted you\)/); assert.ok(prov.includes(shown), 'the cancellation names the release hash shown at release time');
  await step('Does it compare'); await next(); await step('The end');
  assert.deepEqual(errors, []); await ctx.close();
});
