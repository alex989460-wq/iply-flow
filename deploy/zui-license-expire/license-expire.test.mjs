// Run on the VPS: ZUI_API=/opt/zuiplayer/admin-api node --test license-expire.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
const {license} = await import((process.env.ZUI_API || '/opt/zuiplayer/admin-api') + '/commerce.mjs');

const now = Date.UTC(2026, 9, 15, 19, 0);
const H = 3600000;
const partnerDevice = (extra = {}) => ({
  mac: '02:00:00:00:00:01', activePlaylistId: 'p', partnerAccessRequired: true,
  adminExpiredAt: now - 4 * H,
  partnerLicense: {allowed: true, playlistId: 'p', validUntil: now + 24 * H, expiresAt: now + 30 * 24 * H, lastGoodAt: now - H},
  ...extra,
});

test('forced expiry stays while the customer has not logged in again', () => {
  assert.equal(license(partnerDevice(), now).status, 'expired');
});

test('partner login before the forced expiry does not lift it', () => {
  assert.equal(license(partnerDevice({partnerLoginAt: now - 5 * H}), now).status, 'expired');
});

test('partner login after the forced expiry with a valid partner licence reactivates', () => {
  const l = license(partnerDevice({partnerLoginAt: now - H}), now);
  assert.equal(l.status, 'active');
  assert.equal(l.allowed, true);
});

test('partner login after the forced expiry without a valid partner licence stays expired', () => {
  const d = partnerDevice({partnerLoginAt: now - H});
  d.partnerLicense.allowed = false;
  assert.equal(license(d, now).status, 'expired');
});

test('a later paid activation still lifts the forced expiry', () => {
  assert.equal(license(partnerDevice({activeUntil: now + 10 * 24 * H, partnerLicense: null}), now).status, 'active');
});
