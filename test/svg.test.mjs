import assert from 'node:assert/strict';
import { test } from 'node:test';
import { svgFor } from '../src/svg.js';
import { badgeRead, badgeWrite, readCrew, registerCrew } from '../src/crew.js';
import { unb64 } from '../src/bytes.js';

test('svg specs render and escape', () => {
  const s = svgFor('signal G,x,Rf');
  assert.match(s, /^<svg/); assert.equal((s.match(/<circle/g) || []).length, 3); assert.match(s, /<line/); // flashing rays
  assert.match(svgFor('switch reversed'), /reversed/);
  const f = svgFor('form clearance no=134 to="CN 5411 <script>" protect="Frmn Brown"');
  assert.match(f, /No\. 134/); assert.ok(!f.includes('<script>')); assert.match(f, /&lt;script&gt;/);
  assert.match(svgFor('nonsense here'), /unknown drawing/);
});

test('crew text and PNG badge round-trip', async () => {
  const t = await registerCrew('Ian Carter', '123456', 'AbC_pub');
  assert.match(t, /BEGIN BALLAST CREW/);
  const c = await readCrew(t); assert.equal(c.pin, '123456'); assert.equal(c.pub, 'AbC_pub');
  const png = unb64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
  const badge = badgeWrite(png, t);
  assert.equal(badgeRead(badge), t); assert.equal(badgeRead(png), null);
});
