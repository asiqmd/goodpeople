import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Application-level encryption for identity and account numbers (AES-256-GCM).
 *
 * - Ciphertext is bound to its tenant and field (additional authenticated data), so a value
 *   copied into another tenant's row or another column fails to decrypt.
 * - Blind indexes (keyed HMAC, per tenant) let us enforce uniqueness and look up an NID
 *   without storing it in plain text.
 * - Stored format: `v1:<iv>:<tag>:<ciphertext>`; the version prefix allows key rotation.
 */
export interface FieldCipher {
  encrypt(plain: string, context: CipherContext): string;
  decrypt(stored: string, context: CipherContext): string;
  blindIndex(value: string, context: CipherContext): string;
  /** Files (documents, import batches): `GPF1` + iv + tag + ciphertext. */
  encryptBytes(plain: Buffer, context: FileCipherContext): Buffer;
  decryptBytes(stored: Buffer, context: FileCipherContext): Buffer;
}

/** A file is bound to its tenant and to what it is (e.g. `document:<id>`). */
export interface FileCipherContext {
  tenantId: string;
  purpose: string;
}

const FILE_MAGIC = Buffer.from('GPF1');

export interface CipherContext {
  tenantId: string;
  field: CipherField;
}

/** Every encrypted column, named once so encryption and decryption always agree. */
export const CIPHER_FIELDS = {
  assuranceProgram: 'assurance.program',
  assuranceEvent: 'assurance.event',
  saudiWorker: 'saudi.worker_coverage',
  saudiPilot: 'saudi.pilot_payload',
  saudiComparison: 'saudi.comparison',
  saudiEvidence: 'saudi.qualification_evidence',
  saudiWps: 'saudi.wps_payload',
  uaeWorker: 'uae.worker_coverage',
  uaePilot: 'uae.pilot_payload',
  uaeComparison: 'uae.comparison',
  uaeEvidence: 'uae.qualification_evidence',
  uaeWps: 'uae.wps_payload',
  internationalIdentifier: 'international.identifier',
  nid: 'employees.nid',
  birthRegistration: 'employees.birth_registration',
  passport: 'employees.passport',
  tin: 'employees.tin',
  accountNumber: 'employee_payment_accounts.account_number',
  /** An authenticator app's shared secret (tenant and platform logins). */
  mfaSecret: 'users.mfa_secret',
  oidcSecret: 'identity_connections.client_secret',
  webhookSecret: 'webhook_subscriptions.signing_secret',
  /** An employee's pay amounts. */
  payAmounts: 'employee_pay.amounts',
  compensationAmounts: 'compensation_lines.amounts',
  /** A person's results in a payroll run, a run's totals, and amounts entered for a run. */
  runResults: 'payroll_run_items.result',
  runTotals: 'payroll_runs.totals',
  runInputs: 'payroll_inputs.amount',
  /** Investments declared for the tax rebate, and tax deposited for a run. */
  taxDeclarations: 'tax_declarations.items',
  taxDeposits: 'tax_deposits.amount',
  taxOpenings: 'tax_openings.amounts',
  pfEntries: 'pf_entries.amount',
  loanAmounts: 'employee_loans.amounts',
  loanRepayments: 'loan_repayments.amount',
  wppfAmounts: 'wppf_years.amounts',
  /** A payroll sheet uploaded for a parallel run, and the comparison with ours. */
  reconciliationSheet: 'payroll_reconciliations.sheet',
  reconciliationResult: 'payroll_reconciliations.result',
  /** Payments a bank or wallet provider returned, with their accounts. */
  paymentCheck: 'payment_checks.result',
  /** A maternity case's wages and average daily wage, and each part of the benefit paid. */
  maternityWages: 'maternity_cases.wages',
  maternityPayments: 'maternity_payments.amount',
  /** What a worker wrote in a grievance, and the messages that followed. */
  grievanceText: 'grievances.text',
  hrRequestText: 'hr_requests.content',
} as const;
export type CipherField = (typeof CIPHER_FIELDS)[keyof typeof CIPHER_FIELDS];

const aad = ({ tenantId, field }: CipherContext) => Buffer.from(`${tenantId}:${field}`);
const fileAad = ({ tenantId, purpose }: FileCipherContext) => Buffer.from(`${tenantId}:${purpose}`);

function createLegacyFieldCipher(masterKeyBase64: string, suffix = ''): FieldCipher {
  const master = Buffer.from(masterKeyBase64, 'base64');
  if (master.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be 32 random bytes, base64-encoded');
  }
  const derive = (info: string) =>
    Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
  const encKey = derive('good-people:field-encryption:v1');
  const macKey = derive('good-people:blind-index:v1');
  const fileKey = derive('good-people:file-encryption:v1');

  return {
    encrypt(plain, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encKey, iv);
      cipher.setAAD(Buffer.concat([aad(context), Buffer.from(suffix)]));
      const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return ['v1', iv, cipher.getAuthTag(), ciphertext]
        .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
        .join(':');
    },
    decrypt(stored, context) {
      const [version, iv, tag, ciphertext] = stored.split(':');
      if (version !== 'v1' || !iv || !tag || !ciphertext) {
        throw new Error('Unrecognised encrypted value');
      }
      const decipher = createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.concat([aad(context), Buffer.from(suffix)]));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
    encryptBytes(plain, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', fileKey, iv);
      cipher.setAAD(Buffer.concat([fileAad(context), Buffer.from(suffix)]));
      const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
      return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
    },
    decryptBytes(stored, context) {
      if (!stored.subarray(0, 4).equals(FILE_MAGIC)) throw new Error('Unrecognised encrypted file');
      const decipher = createDecipheriv('aes-256-gcm', fileKey, stored.subarray(4, 16));
      decipher.setAAD(Buffer.concat([fileAad(context), Buffer.from(suffix)]));
      decipher.setAuthTag(stored.subarray(16, 32));
      return Buffer.concat([decipher.update(stored.subarray(32)), decipher.final()]);
    },
    blindIndex(value, { tenantId, field }) {
      return createHmac('sha256', macKey)
        .update(`${tenantId}:${field}:${value.trim().toUpperCase()}`)
        .digest('base64url');
    },
  };
}

export function createFieldCipher(
  masterKeyBase64: string,
  options: { activeKeyId?: string; keys?: Record<string, string> } = {},
): FieldCipher {
  const legacy = createLegacyFieldCipher(masterKeyBase64),
    keys = new Map<string, FieldCipher>();
  if (Object.keys(options.keys ?? {}).length > 8)
    throw new Error('At most eight retained encryption keys are supported');
  for (const [id, key] of Object.entries(options.keys ?? {})) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id)) throw new Error('Invalid encryption key ID');
    keys.set(id, createLegacyFieldCipher(key, ':key:' + id));
  }
  if (options.activeKeyId && !keys.has(options.activeKeyId))
    throw new Error('Active encryption key is unavailable');
  const active = options.activeKeyId ? keys.get(options.activeKeyId)! : legacy;
  const key = (id: string) => {
    const cipher = keys.get(id);
    if (!cipher) throw new Error('Historical encryption key is unavailable');
    return cipher;
  };
  return {
    blindIndex: (value, context) => legacy.blindIndex(value, context),
    encrypt: (value, context) => {
      const stored = active.encrypt(value, context);
      return options.activeKeyId ? 'v2:' + options.activeKeyId + ':' + stored.slice(3) : stored;
    },
    decrypt: (stored, context) => {
      if (!stored.startsWith('v2:')) return legacy.decrypt(stored, context);
      const [, id, ...parts] = stored.split(':');
      return key(id!).decrypt('v1:' + parts.join(':'), context);
    },
    encryptBytes: (value, context) => {
      const stored = active.encryptBytes(value, context);
      return options.activeKeyId
        ? Buffer.concat([
            Buffer.from('GPF2'),
            Buffer.from([options.activeKeyId.length]),
            Buffer.from(options.activeKeyId),
            stored,
          ])
        : stored;
    },
    decryptBytes: (stored, context) => {
      if (!stored.subarray(0, 4).equals(Buffer.from('GPF2')))
        return legacy.decryptBytes(stored, context);
      const length = stored[4]!;
      if (length < 1 || length > 32 || stored.length < 5 + length + 32)
        throw new Error('Invalid encrypted file header');
      return key(stored.subarray(5, 5 + length).toString('ascii')).decryptBytes(
        stored.subarray(5 + length),
        context,
      );
    },
  };
}
