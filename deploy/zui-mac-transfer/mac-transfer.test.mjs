import test from 'node:test';
import assert from 'node:assert/strict';
import {transferActivation, transfersRemaining} from './mac-transfer.mjs';

const dev = (id, mac, extra = {}) => ({id, mac, deviceKey: 'K' + id, revision: 0, ...extra});

test('license and playlists move to the new MAC; old MAC gets the new device entitlements', () => {
  const old = dev('a', '02:00:00:00:00:01', {activeUntil: 999, playlists: [{id: 'p'}], activePlaylistId: 'p'});
  const fresh = dev('b', '02:00:00:00:00:02');
  transferActivation(old, fresh, 10);
  assert.equal(fresh.activeUntil, 999);
  assert.deepEqual(fresh.playlists, [{id: 'p'}]);
  assert.equal(old.activeUntil, undefined);
  assert.equal(old.mac, '02:00:00:00:00:01');
  assert.equal(fresh.mac, '02:00:00:00:00:02');
});

test('a license can be transferred at most 3 times, following the license', () => {
  const d = [1, 2, 3, 4, 5].map(i => dev('d' + i, '02:00:00:00:00:0' + i));
  d[0].activeUntil = 5;
  transferActivation(d[0], d[1]); transferActivation(d[1], d[2]); transferActivation(d[2], d[3]);
  assert.equal(transfersRemaining(d[3]), 0);
  assert.throws(() => transferActivation(d[3], d[4]), /Limite de 3/);
});

test('cannot transfer into a device of another reseller', () => {
  assert.throws(() => transferActivation(dev('a', 'A', {resellerId: 'r1'}), dev('b', 'B', {resellerId: 'r2'})), /outra revenda/);
});
