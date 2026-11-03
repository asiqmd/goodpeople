import { SecurityState } from '../../common/security-state.js';
import type { AppConfig } from '../../config.js';
import { randomUUID } from 'node:crypto';
import {
  isWeakPin,
  KIOSK_LOCK_MINUTES,
  kioskPinSchema,
  kioskPinSetSchema,
  kioskSignInSchema,
} from '@gp/shared';
import { EndedSessions, PinLockout } from './kiosk-state.js';
import { newKioskToken, parseKioskToken, phoneEnding, secretMatches } from './kiosk-tokens.js';

describe('kiosk device tokens', async () => {
  it('names the workspace and the kiosk, and keeps only a hash of the secret', async () => {
    const [tenantId, kioskId] = [randomUUID(), randomUUID()];
    const { token, tokenPrefix, secretHash } = newKioskToken(tenantId, kioskId);
    const parsed = parseKioskToken(token)!;
    expect(parsed).toMatchObject({ tenantId, kioskId });
    expect(token.startsWith(`gpk.${tenantId}.${kioskId}.`)).toBe(true);
    expect(parsed.secret.startsWith(tokenPrefix)).toBe(true);
    expect(secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(secretHash).not.toContain(parsed.secret);
    expect(secretMatches(secretHash, parsed.secret)).toBe(true);
    expect(secretMatches(secretHash, `${parsed.secret}x`)).toBe(false);
    expect(newKioskToken(tenantId, kioskId).token).not.toBe(token);
  });

  it('refuses anything that is not a kiosk token', async () => {
    const [tenantId, kioskId] = [randomUUID(), randomUUID()];
    const secret = 'a'.repeat(43);
    expect(parseKioskToken(`gpk.${tenantId}.${kioskId}.${secret}`)).not.toBeNull();
    for (const token of [
      `gpe.${tenantId}.${kioskId}.${secret}`,
      `gpk.${tenantId}.${kioskId}.short`,
      `gpk.not-a-uuid.${kioskId}.${secret}`,
      `gpk.${tenantId}.${kioskId}.${secret}.extra`,
      `gpk.${tenantId}.${kioskId}.${secret.slice(0, 40)}!!!`,
      '',
    ]) {
      expect(parseKioskToken(token)).toBeNull();
    }
    expect(secretMatches('not-hex', secret)).toBe(false);
  });
});

describe('kiosk PINs', async () => {
  it('turns down PINs that are guessed first', async () => {
    for (const pin of ['0000', '1111', '1234', '4321', '0123', '123456', '987654', '55555']) {
      expect(isWeakPin(pin)).toBe(true);
    }
    for (const pin of ['1357', '2580', '8901', '1243', '120394', '4455']) {
      expect(isWeakPin(pin)).toBe(false);
    }
  });

  it('takes 4 to 6 digits for a new PIN, and any well-formed PIN at sign-in', async () => {
    expect(kioskPinSchema.safeParse('2580').success).toBe(true);
    expect(kioskPinSchema.safeParse('120394').success).toBe(true);
    for (const pin of ['258', '1203945', '25a0', ' 2580', '1234']) {
      expect(kioskPinSchema.safeParse(pin).success).toBe(false);
    }
    expect(
      kioskPinSetSchema.safeParse({ employeeCode: 'MG-0001', code: '12345', pin: '2580' }).success,
    ).toBe(false);
    // Signing in checks the form only: an old weak PIN still opens the worker's screen.
    expect(kioskSignInSchema.safeParse({ employeeCode: ' MG-0001 ', pin: '1234' }).data).toEqual({
      employeeCode: 'MG-0001',
      pin: '1234',
    });
  });

  it('shows the last two digits of a real number, and fixed made-up ones otherwise', async () => {
    const workspace = randomUUID();
    expect(phoneEnding('+8801812345678', 'secret', workspace, 'MG-0001')).toBe('78');
    const made = phoneEnding(null, 'secret', workspace, 'MG-9999');
    expect(made).toMatch(/^\d{2}$/);
    expect(phoneEnding(null, 'secret', workspace, 'mg-9999')).toBe(made);
    const others = ['MG-9998', 'MG-9997', 'MG-9996', 'MG-9995'].map((c) =>
      phoneEnding(null, 'secret', workspace, c),
    );
    expect(new Set([made, ...others]).size).toBeGreaterThan(1);
  });
});

describe('kiosk lockout', async () => {
  const MINUTE = 60_000;

  it('locks a worker for 15 minutes after five wrong PINs in a row', async () => {
    const lockout = new PinLockout(
      new SecurityState({
        SECURITY_STORE: 'memory',
        SECURITY_NAMESPACE: 'kiosk-unit',
      } as AppConfig),
    );
    const start = Date.now();
    for (let i = 0; i < 4; i++) expect(await lockout.fail('t:e', start + i)).toBe(0);
    expect(await lockout.lockedFor('t:e', start + 4)).toBe(0);
    expect(await lockout.fail('t:e', start + 5)).toBe(KIOSK_LOCK_MINUTES * 60);
    expect(await lockout.lockedFor('t:e', start + 5 + 10 * MINUTE)).toBe(5 * 60);
    // Another worker is not affected, and the lock does not grow while it lasts.
    expect(await lockout.lockedFor('t:other', start + 6)).toBe(0);
    expect(await lockout.fail('t:e', start + 5 + 14 * MINUTE)).toBe(60);
    // After the lock, the count starts again.
    const after = start + 5 + KIOSK_LOCK_MINUTES * MINUTE;
    expect(await lockout.lockedFor('t:e', after)).toBe(0);
    expect(await lockout.fail('t:e', after)).toBe(0);
  });

  it('forgets wrong PINs after a right one, or after 15 quiet minutes', async () => {
    const lockout = new PinLockout(
      new SecurityState({
        SECURITY_STORE: 'memory',
        SECURITY_NAMESPACE: 'kiosk-unit',
      } as AppConfig),
    );
    const start = Date.now();
    for (let i = 0; i < 4; i++) await lockout.fail('t:e', start + i);
    await lockout.reset('t:e');
    expect(await lockout.fail('t:e', start + 10)).toBe(0);
    for (let i = 0; i < 3; i++) await lockout.fail('t:e', start + 20 + i);
    expect(await lockout.fail('t:e', start + 23 + KIOSK_LOCK_MINUTES * MINUTE)).toBe(0);
  });

  it('remembers ended sessions until they would have expired', async () => {
    const ended = new EndedSessions(
      new SecurityState({
        SECURITY_STORE: 'memory',
        SECURITY_NAMESPACE: 'kiosk-unit',
      } as AppConfig),
    );
    await ended.end('a', Date.now() + MINUTE);
    await ended.end('b', Date.now() - 1);
    expect(await ended.has('a')).toBe(true);
    await ended.end('c', Date.now() + MINUTE);
    expect(await ended.has('b')).toBe(false);
  });
});
