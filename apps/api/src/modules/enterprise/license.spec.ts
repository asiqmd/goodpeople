import { generateKeyPairSync, randomUUID, randomBytes } from 'node:crypto';
import {
  verifyEnterpriseLicense,
  signEnterpriseLicense,
  licenseState,
  createFieldCipher,
} from '@gp/db';
import type { EnterpriseLicense } from '@gp/shared';
import { DisabledSender } from '../notifications/senders.js';
const key = generateKeyPairSync('ed25519'),
  pub = key.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  binding = { installationId: randomUUID(), tenantId: randomUUID() };
const claims: EnterpriseLicense = {
  schema_version: 1,
  license_id: randomUUID(),
  installation_id: binding.installationId,
  tenant_id: binding.tenantId,
  customer_id: 'Offline customer',
  sequence: 1,
  issued_at: '2026-01-01T00:00:00Z',
  not_before: '2026-01-01T00:00:00Z',
  expires_at: '2026-02-01T00:00:00Z',
  grace_days: 3,
  features: ['core_hr'],
  limits: { max_employees: 20, max_legal_entities: 2, storage_gb: 1, sms_credits_monthly: 0 },
};
describe('offline license verification', () => {
  it('verifies exact signed bytes and installation binding without network access', () => {
    const signed = signEnterpriseLicense(claims, 'vendor', key.privateKey);
    expect(verifyEnterpriseLicense(signed, { vendor: pub }, binding)).toEqual(claims);
    expect(() =>
      verifyEnterpriseLicense(signed, { vendor: pub }, { ...binding, tenantId: randomUUID() }),
    ).toThrow('binding_mismatch');
    const parts = signed.split('.');
    parts[2] = Buffer.from(
      JSON.stringify({ ...claims, features: ['core_hr', 'payroll'] }),
    ).toString('base64url');
    expect(() => verifyEnterpriseLicense(parts.join('.'), { vendor: pub }, binding)).toThrow(
      'bad_signature',
    );
  });
  it('rejects untrusted keys, unsigned payloads and extra private-authority claims', () => {
    const signed = signEnterpriseLicense(claims, 'vendor', key.privateKey);
    expect(() => verifyEnterpriseLicense(signed, {}, binding)).toThrow('untrusted_key');
    expect(() => verifyEnterpriseLicense(signed + '.extra', { vendor: pub }, binding)).toThrow(
      'invalid_format',
    );
    expect(() =>
      signEnterpriseLicense(
        { ...claims, permissions: ['payroll.approve'] } as EnterpriseLicense,
        'vendor',
        key.privateKey,
      ),
    ).toThrow();
  });
  it.each([
    ['2026-01-31T23:59:59Z', 'valid'],
    ['2026-02-01T00:00:00Z', 'grace'],
    ['2026-02-04T00:00:00Z', 'expired'],
    ['2025-12-31T23:59:59Z', 'invalid'],
  ])('resolves signed expiry/grace at %s', (date, state) => {
    expect(licenseState(claims, new Date(date))).toBe(state);
  });
  it('does not extend an expired license after a clock rollback', () => {
    expect(licenseState(claims, new Date('2026-01-01'), true)).toBe('clock_rollback');
  });
});
describe('historical encryption key custody', () => {
  it('reads legacy and rotated fields/files while preserving stable blind indexes', () => {
    const root = randomBytes(32).toString('base64'),
      first = randomBytes(32).toString('base64'),
      second = randomBytes(32).toString('base64'),
      old = createFieldCipher(root),
      rotated = createFieldCipher(root, { activeKeyId: 'a', keys: { a: first } }),
      next = createFieldCipher(root, { activeKeyId: 'b', keys: { a: first, b: second } }),
      context = { tenantId: binding.tenantId, field: 'employees.nid' as const },
      file = { tenantId: binding.tenantId, purpose: 'document:' + randomUUID() };
    const legacy = old.encrypt('1234567890', context),
      v2 = rotated.encrypt('9876543210', context),
      bytes = rotated.encryptBytes(Buffer.from('Private document'), file);
    expect(next.decrypt(legacy, context)).toBe('1234567890');
    expect(next.decrypt(v2, context)).toBe('9876543210');
    expect(next.decryptBytes(bytes, file).toString()).toBe('Private document');
    expect(next.blindIndex('123', context)).toBe(old.blindIndex('123', context));
    expect(next.encrypt('New', context)).toMatch(/^v2:b:/);
    expect(() => next.decrypt(v2, { ...context, tenantId: randomUUID() })).toThrow();
    expect(() =>
      createFieldCipher(root, { activeKeyId: 'b', keys: { b: second } }).decrypt(v2, context),
    ).toThrow('Historical encryption key');
    expect(() => next.decrypt(v2.replace('v2:a:', 'v2:b:'), context)).toThrow();
  });
  it('refuses an absent active key before encrypting new records', () => {
    expect(() =>
      createFieldCipher(randomBytes(32).toString('base64'), { activeKeyId: 'missing' }),
    ).toThrow('Active encryption key');
  });
});
it('disabled notification channels never report a successful send', async () => {
  const sender = new DisabledSender<{ text: string }>();
  expect(sender.driver).toBe('disabled');
  await expect(sender.send({ text: 'secret' })).rejects.toThrow('disabled');
});
