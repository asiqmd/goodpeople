import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { MFA_RECOVERY_CODES } from '@gp/shared';

// Authenticator-app codes (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits), as used by
// Google Authenticator, Microsoft Authenticator, 1Password and others.

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Not base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new shared secret: 160 random bits, base32 as authenticator apps expect. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, at: Date): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at.getTime() / 1000 / STEP_SECONDS)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const number = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(number).padStart(DIGITS, '0');
}

/**
 * The time step a code belongs to: the current one or a neighbour, for clocks a little out of
 * step. Undefined when the code is wrong.
 */
export function totpStep(secret: string, code: string, now = new Date()): number | undefined {
  const given = Buffer.from(code.trim());
  const current = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
  return [current - 1, current, current + 1].find((step) => {
    const expected = Buffer.from(totpAt(secret, new Date(step * STEP_SECONDS * 1000)));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

/** Accepts the current code and its neighbours. */
export function verifyTotp(secret: string, code: string, now = new Date()): boolean {
  return totpStep(secret, code, now) !== undefined;
}

export function otpauthUrl(secret: string, account: string, issuer = 'Good People'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── Recovery codes and SMS codes ─────────────────────────────────────────────

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const recoveryPart = () =>
  Array.from({ length: 4 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');

/** Codes like `k7qm-2xpd`; only their hashes are stored. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: MFA_RECOVERY_CODES }, () => `${recoveryPart()}-${recoveryPart()}`);
}

export const hashCode = (code: string) =>
  createHash('sha256').update(code.trim().toLowerCase()).digest('hex');

/** A random numeric code of the given length, e.g. an SMS sign-in code. */
export function numericCode(length: number): string {
  return Array.from({ length }, () => randomInt(10)).join('');
}
