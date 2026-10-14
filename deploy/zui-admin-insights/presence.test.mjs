import {test} from 'node:test';
import assert from 'node:assert/strict';
import {devicePresence} from './presence.mjs';
test('active playback remains online even without configuration polling', () => {
  assert.deepEqual(devicePresence({lastSeenAt:1},true,500000),{online:true,playing:true});
});
test('recent contact is online without playback', () => {
  assert.equal(devicePresence({lastSeenAt:11001},false,100000).online,true);
});
test('stale contact without an active playback lease is offline', () => {
  assert.equal(devicePresence({lastSeenAt:10000},false,100000).online,false);
  assert.equal(devicePresence({},false,100000).online,false);
});