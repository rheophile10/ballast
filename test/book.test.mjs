// The rulebook in Ballast, in Chromium over file://: load the document, read it, annotate, then open it during an exercise.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const url = 'file://' + new URL('../index.html', import.meta.url).pathname;
const doc = readFileSync(new URL('../documents/cror-2025.json', import.meta.url), 'utf8');
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

test('load cror-2025.json, search, follow a link, annotate; then consult it while writing an exercise', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } }); const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', (e) => errors.push(e.message)); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'my note' : undefined));
  await p.goto(url); await p.fill('input[placeholder="Name"]', 'Reader Person'); await p.fill('input[placeholder^="PIN"]', '424242'); await p.click('button[type=submit]');
  await p.waitForSelector('text=waiting for a role');
  // the rulebook: nothing loaded yet → drop the document as text
  await p.click('nav >> text=Rulebook'); await p.waitForSelector('text=No rulebook is loaded');
  await p.setInputFiles('input[type=file]', { name: 'cror-2025.json', mimeType: 'application/json', buffer: Buffer.from(doc) });
  await p.waitForSelector('.reader'); await p.fill('.rside input', 'imperfectly displayed'); await p.click('.rresults a >> nth=0');
  await p.waitForSelector('h2:has-text("27. Signal Imperfectly Displayed")'); await p.click('.rtext .rlink >> nth=0'); await p.waitForSelector('h2:has-text("27(b)")');
  // annotate: select a few words in the text, then the button; the mark carries the note on hover
  await p.evaluate(() => { const t = document.querySelector('.rtext').firstChild; const r = document.createRange(); r.setStart(t, 8); r.setEnd(t, 30); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await p.click('button:has-text("Annotate selection")'); await p.waitForSelector('mark.rnote'); assert.equal(await p.getAttribute('mark.rnote', 'title'), 'my note — Reader Person');
  assert.match(await p.textContent('button:has-text("Notes out")'), /\(1\)/);
  await p.click('button:has-text("Close")'); await p.waitForSelector('text=waiting for a role');
  // the note survives a reload (it is in this browser)
  await p.reload(); await p.click('nav >> text=Rulebook'); await p.waitForSelector('.reader'); await p.click('.rtoc a:has-text("Signals")'); await p.click('.rlist a:has-text("27.")'); await p.click('.rlist a:has-text("27(b)")'); await p.waitForSelector('mark.rnote');
  await p.click('button:has-text("Close")');
  // an exercise is open book: the Rulebook button opens the reader over the canvas, without a break
  await p.click('button:has-text("Signals — aspects")'); await p.waitForSelector('text=Open book'); await p.waitForSelector('text=is loaded');
  const complete = await p.textContent('.complete b'); await p.fill('input[placeholder^="Repeat"]', complete.toLowerCase()); await p.click('text=Repeat and enter fullscreen');
  await p.waitForSelector('canvas[data-hits]'); await p.click('button:has-text("Rulebook")'); await p.waitForSelector('.overlay.book .reader');
  await p.fill('.overlay.book .rside input', 'clear to stop'); await p.click('.overlay.book .rresults a >> nth=0'); await p.waitForSelector('.overlay.book h2:has-text("411")');
  assert.equal(await p.locator('.overlay.book button:has-text("Annotate")').count(), 0, 'reading only while writing');
  await p.click('.overlay.book button:has-text("Close")'); await p.waitForSelector('.overlay.book', { state: 'detached' });
  assert.equal(await p.locator('text=Rule 35').count(), 0, 'no break was recorded');
  assert.deepEqual(errors, []); await ctx.close();
});
