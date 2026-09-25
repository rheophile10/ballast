import assert from 'node:assert/strict';
import { test } from 'node:test';
import { svgFor } from '../src/svg.js';

test('svg specs render and escape', () => {
  const s = svgFor('signal G,x,Rf');
  assert.match(s, /^<svg/); assert.equal((s.match(/<circle/g) || []).length, 3); assert.match(s, /<line/); // flashing rays
  assert.match(svgFor('switch reversed'), /reversed/);
  const f = svgFor('form clearance no=134 to="WNR 5411 <script>" protect="Frmn Brown"');
  assert.match(f, /No\. 134/); assert.ok(!f.includes('<script>')); assert.match(f, /&lt;script&gt;/);
  assert.match(svgFor('nonsense here'), /unknown drawing/);
});

