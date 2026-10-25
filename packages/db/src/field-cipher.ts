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
  nid: 'employees.nid',
  birthRegistration: 'employees.birth_registration',
  passport: 'employees.passport',
  tin: 'employees.tin',
  accountNumber: 'employee_payment_accounts.account_number',
  /** An authenticator app's shared secret (tenant and platform logins). */
  mfaSecret: 'users.mfa_secret',
  /** An employee's pay amounts. */
  payAmounts: 'employee_pay.amounts',
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
} as const;
export type CipherField = (typeof CIPHER_FIELDS)[keyof typeof CIPHER_FIELDS];

const aad = ({ tenantId, field }: CipherContext) => Buffer.from(`${tenantId}:${field}`);
const fileAad = ({ tenantId, purpose }: FileCipherContext) => Buffer.from(`${tenantId}:${purpose}`);

export function createFieldCipher(masterKeyBase64: string): FieldCipher {
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
      cipher.setAAD(aad(context));
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
      decipher.setAAD(aad(context));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
    encryptBytes(plain, context) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', fileKey, iv);
      cipher.setAAD(fileAad(context));
      const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
      return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
    },
    decryptBytes(stored, context) {
      if (!stored.subarray(0, 4).equals(FILE_MAGIC)) throw new Error('Unrecognised encrypted file');
      const decipher = createDecipheriv('aes-256-gcm', fileKey, stored.subarray(4, 16));
      decipher.setAAD(fileAad(context));
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
