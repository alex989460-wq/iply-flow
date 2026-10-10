import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const { decryptBackup } = await import(pathToFileURL(process.argv[2]).href);
function encrypt(bundle, key) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const header = Buffer.concat([Buffer.from('ZUIBACK1'), Buffer.from([0]), salt]);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);
  const bytes = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(bundle)))), cipher.final()]);
  return Buffer.concat([header, iv, cipher.getAuthTag(), bytes]);
}
test('backup exceeding the former 128 MiB bound decrypts below 192 MiB', () => {
  const key = randomBytes(32);
  const bytes = encrypt({ format: 1, database: 'db', credentialKey: 'key', system: 'x'.repeat(129 * 1024 * 1024) }, key);
  assert.equal(decryptBackup(bytes, { key }).system.length, 129 * 1024 * 1024);
});
test('tampered encrypted backup is rejected', () => {
  const key = randomBytes(32), bytes = encrypt({ format: 1, database: 'db', credentialKey: 'key' }, key);
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => decryptBackup(bytes, { key }), /Backup alterado/);
});
test('decompression remains bounded at 192 MiB', () => {
  const key = randomBytes(32);
  const bytes = encrypt({ format: 1, database: 'db', credentialKey: 'key', system: 'x'.repeat(193 * 1024 * 1024) }, key);
  assert.throws(() => decryptBackup(bytes, { key }), /Backup alterado/);
});