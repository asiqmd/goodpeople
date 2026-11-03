import { createPublicKey, sign, verify, type KeyLike } from 'node:crypto';
import { enterpriseLicenseSchema, type EnterpriseLicense, type LicenseState } from '@gp/shared';
export interface LicenseBinding {
  installationId: string;
  tenantId: string;
  customerId?: string;
}
export class LicenseError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const b64 = (raw: string) => Buffer.from(raw, 'base64url');
export function verifyEnterpriseLicense(
  envelope: string,
  keys: Record<string, string>,
  binding: LicenseBinding,
): EnterpriseLicense {
  if (envelope.length > 24000) throw new LicenseError('license_too_large');
  const parts = envelope.split('.');
  if (
    parts.length !== 4 ||
    parts[0] !== 'gplic1' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(parts[1]!) ||
    !parts.slice(2).every((s) => /^[a-zA-Z0-9_-]+$/.test(s))
  )
    throw new LicenseError('invalid_format');
  const [prefix, kid, payload, signature] = parts,
    raw = keys[kid!];
  if (!raw) throw new LicenseError('untrusted_key');
  try {
    const key = createPublicKey(raw);
    if (
      key.asymmetricKeyType !== 'ed25519' ||
      b64(signature!).length !== 64 ||
      !verify(null, Buffer.from(`${prefix}.${kid}.${payload}`), key, b64(signature!))
    )
      throw new Error();
  } catch {
    throw new LicenseError('bad_signature');
  }
  let license: EnterpriseLicense;
  try {
    license = enterpriseLicenseSchema.parse(JSON.parse(b64(payload!).toString('utf8')));
  } catch {
    throw new LicenseError('invalid_claims');
  }
  if (
    license.installation_id !== binding.installationId ||
    license.tenant_id !== binding.tenantId ||
    (binding.customerId && license.customer_id !== binding.customerId)
  )
    throw new LicenseError('binding_mismatch');
  return license;
}
/** Vendor-side only. No private signing key is part of an installed deployment. */
export function signEnterpriseLicense(
  claims: EnterpriseLicense,
  kid: string,
  key: KeyLike,
): string {
  const license = enterpriseLicenseSchema.parse(claims);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(kid)) throw new LicenseError('invalid_key_id');
  const payload = Buffer.from(JSON.stringify(license)).toString('base64url'),
    input = `gplic1.${kid}.${payload}`;
  return `${input}.${sign(null, Buffer.from(input), key).toString('base64url')}`;
}
export function licenseState(
  license: EnterpriseLicense | null,
  now: Date,
  rollback = false,
): LicenseState {
  if (rollback) return 'clock_rollback';
  if (!license) return 'missing';
  const t = now.getTime();
  if (t < Date.parse(license.not_before)) return 'invalid';
  if (t < Date.parse(license.expires_at)) return 'valid';
  return t < Date.parse(license.expires_at) + license.grace_days * 86400000 ? 'grace' : 'expired';
}
