import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { ModelVault, vaultOpenMessage } from '../vault.mjs';

test('Windows can read a copied Mac AES vault with its original matching key without changing the files', async t => {
  const directory = await mkdtemp('/tmp/clever-vault-copy-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = new ModelVault(directory, { platform: 'darwin' });
  const saved = await original.save({ name: 'Copied model', endpoint: 'https://example.com/v1', model: 'test', apiKey: 'disposable-migration-test' });
  const before = await readFile(original.filename);
  const copied = new ModelVault(directory, { platform: 'win32' });
  assert.equal((await copied.credentials(saved.activeId)).apiKey, 'disposable-migration-test');
  assert.equal((await copied.list()).protection, 'local-aes-gcm');
  assert.deepEqual(await readFile(original.filename), before);
});

test('a missing AES key never generates a replacement or overwrites the encrypted library', async t => {
  const directory = await mkdtemp('/tmp/clever-vault-missing-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vault = new ModelVault(directory, { platform: 'darwin' });
  await vault.save({ endpoint: 'https://example.com/v1', model: 'test', apiKey: 'disposable-migration-test' });
  const before = await readFile(vault.filename);
  await rm(directory + '/vault.key');
  const copied = new ModelVault(directory, { platform: 'win32' });
  await assert.rejects(copied.read(), /vault.key/);
  await assert.rejects(access(directory + '/vault.key'), { code: 'ENOENT' });
  assert.deepEqual(await readFile(vault.filename), before);
});

test('vault errors describe the actual format and operating system', () => {
  assert.match(vaultOpenMessage('win32', 'windows-dpapi'), /当前 Windows 账户/);
  assert.doesNotMatch(vaultOpenMessage('win32', 'windows-dpapi'), /Mac/);
  assert.match(vaultOpenMessage('darwin', 'windows-dpapi'), /原 Windows/);
  assert.match(vaultOpenMessage('win32', 'windows-dpapi', 'ENOENT'), /PowerShell/);
  assert.match(vaultOpenMessage('win32', 'local-aes-gcm'), /vault.key/);
  assert.match(vaultOpenMessage('win32'), /格式不正确/);
});
