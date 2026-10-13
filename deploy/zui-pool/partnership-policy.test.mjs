import {test} from 'node:test';
import assert from 'node:assert/strict';
import {partnershipExpiry,partnershipActive,partnershipDate} from './partnership-policy.mjs';
test('optional deadline preserves existing partners',()=>assert.equal(partnershipActive({}),true));
test('deadline includes the entire selected day in Sao Paulo',()=>{
 const end=partnershipExpiry('2026-10-13');assert.equal(end,Date.parse('2026-10-14T02:59:59.999Z'));
 assert.equal(partnershipActive({partnerExpiresAt:end},end-1),true);assert.equal(partnershipActive({partnerExpiresAt:end},end),false);
 assert.equal(partnershipDate(end),'2026-10-13');
});
test('clear deadline and reject impossible dates',()=>{assert.equal(partnershipExpiry(''),null);assert.throws(()=>partnershipExpiry('2026-02-30'));});