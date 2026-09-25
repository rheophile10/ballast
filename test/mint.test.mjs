import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeProfile, mintProfile, checkMint, profileText, readProfile, registration } from '../src/profile.js';

test('roles are minted down a chain and verified on read', async () => {
  const sup0 = await makeProfile('superintendent', 'Sup', '900001', '', true);
  const sup = { ...sup0, ...(await mintProfile(sup0, sup0, 'superintendent')) };   // root self-mints
  assert.ok(await checkMint(sup));
  const rtc0 = await makeProfile('none', 'Teach', '777777', '', true);
  const rtcMinted = await mintProfile(sup, rtc0, 'rtc', '2026-09-24');
  assert.equal(rtcMinted.role, 'rtc'); assert.equal(rtcMinted.minted.by.name, 'Sup'); assert.ok(await checkMint(rtcMinted));
  const rtc = { ...rtc0, ...rtcMinted };
  const crew0 = await makeProfile('none', 'Alice', '123456');
  await assert.rejects(mintProfile(crew0, crew0, 'crew'), /cannot mint/);          // crew cannot mint
  await assert.rejects(mintProfile(sup, crew0, 'crew'), /cannot mint/);            // superintendent does not mint crew
  const crew = await mintProfile(rtc, crew0, 'crew');
  assert.ok(await checkMint(crew));
  const forged = { ...crew, role: 'rtc', minted: { ...crew.minted, role: 'rtc' } }; assert.ok(!(await checkMint(forged)));
  const tampered = { ...crew, pin: '123457' }; assert.ok(!(await checkMint(tampered)));
  // travels as text; an unminted registration reads back with role none; a bad mint is refused
  const back = await readProfile(await profileText(crew)); assert.equal(back.role, 'crew'); assert.equal(back.minted.by.pin, '777777');
  const reg = await readProfile(await profileText(registration(crew0))); assert.equal(reg.role, 'none');
  await assert.rejects(readProfile(await profileText(forged)), /not properly minted/);
});
