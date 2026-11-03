#!/usr/bin/env node
// Vendor workstation only. No issuer key is part of a release or runtime environment.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createPrivateKey, sign } from 'node:crypto';
const [claimsPath, keyPath, kid, output] = process.argv.slice(2);
if (!/^[a-zA-Z0-9_-]{1,64}$/.test(kid ?? ''))
  throw new Error('A bounded signing key ID is required');
if ((await stat(keyPath)).mode & 0o077) throw new Error('Issuer key must have mode 0600');
const key = createPrivateKey(await readFile(keyPath));
if (key.asymmetricKeyType !== 'ed25519') throw new Error('Use an Ed25519 issuer key');
const claims = JSON.parse(await readFile(claimsPath, 'utf8'));
if (claims.schema_version !== 1) throw new Error('Unsupported license version');
const payload = Buffer.from(JSON.stringify(claims)).toString('base64url'),
  body = `gplic1.${kid}.${payload}`;
await writeFile(output, body + '.' + sign(null, Buffer.from(body), key).toString('base64url'), {
  mode: 0o600,
  flag: 'wx',
});
console.log(
  'Signed license written. Validate its complete claims with the matching release before delivery.',
);
