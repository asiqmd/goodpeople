import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// A kiosk's device token is `gpk.<tenant>.<kiosk>.<secret>`, like an Edge Agent's: it names
// its workspace, so the guard can check it under row-level security, and only the secret's
// SHA-256 is kept.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TOKEN = new RegExp(`^gpk\\.(${UUID})\\.(${UUID})\\.([A-Za-z0-9_-]{32,})$`);

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

export interface KioskSecret {
  token: string;
  tokenPrefix: string;
  secretHash: string;
}

export function newKioskToken(tenantId: string, kioskId: string): KioskSecret {
  const secret = randomBytes(32).toString('base64url');
  return {
    token: `gpk.${tenantId}.${kioskId}.${secret}`,
    tokenPrefix: secret.slice(0, 6),
    secretHash: sha256Hex(secret),
  };
}

export function parseKioskToken(
  token: string,
): { tenantId: string; kioskId: string; secret: string } | null {
  const match = TOKEN.exec(token);
  if (!match) return null;
  const [, tenantId, kioskId, secret] = match as unknown as [string, string, string, string];
  return { tenantId, kioskId, secret };
}

/** Compares a secret with a stored SHA-256 in constant time. */
export function secretMatches(secretHash: string, secret: string): boolean {
  const expected = Buffer.from(secretHash, 'hex');
  const actual = Buffer.from(sha256Hex(secret), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The two digits shown after a PIN code is asked for. A real number shows its own last two
 * digits; an employee code that belongs to nobody (in `workspace`) gets two digits derived
 * from a server secret, the same every time, so asking again does not tell the two apart.
 */
export function phoneEnding(
  phone: string | null,
  secret: string,
  workspace: string,
  employeeCode: string,
): string {
  if (phone) return phone.slice(-2);
  const n = createHmac('sha256', secret)
    .update(`kiosk-phone:${workspace}:${employeeCode.toLowerCase()}`)
    .digest()
    .readUInt16BE(0);
  return String(n % 100).padStart(2, '0');
}
