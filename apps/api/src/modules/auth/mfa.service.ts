import { Inject, Injectable } from '@nestjs/common';
import {
  CIPHER_FIELDS,
  platformUsers,
  runAsTenant,
  tenantUsers,
  type Database,
  type FieldCipher,
} from '@gp/db';
import type { MfaSetup } from '@gp/shared';
import { eq } from 'drizzle-orm';
import { badRequest } from '../../common/errors.js';
import { DB, FIELD_CIPHER } from '../../db/db.module.js';
import { hashCode, newRecoveryCodes, newTotpSecret, otpauthUrl, totpStep } from './totp.js';

/** A tenant login or a platform login: they live in different tables. */
export type Subject =
  { kind: 'platform'; id: string } | { kind: 'tenant'; id: string; tenantId: string };

interface MfaColumns {
  email: string | null;
  mfaSecretEnc: string | null;
  mfaEnabledAt: Date | null;
  mfaRecoveryCodes: string[];
}

const mfaColumns = (table: typeof platformUsers | typeof tenantUsers) => ({
  email: table.email,
  mfaSecretEnc: table.mfaSecretEnc,
  mfaEnabledAt: table.mfaEnabledAt,
  mfaRecoveryCodes: table.mfaRecoveryCodes,
});

/** How long a used authenticator step is remembered: the three steps a code is accepted in. */
const STEP_MEMORY_MS = 90_000;

/**
 * Two-step sign-in with an authenticator app. The shared secret is field-encrypted; recovery
 * codes are stored hashed and each works once, and so does each authenticator code.
 */
@Injectable()
export class MfaService {
  /**
   * The last authenticator step each login used. In this process's memory, like the rate
   * limits: several API instances need it in the database.
   */
  private readonly lastSteps = new Map<string, { step: number; until: number }>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** Starts (or restarts) setup: a new secret that is not in force until confirmed. */
  async begin(subject: Subject): Promise<MfaSetup> {
    const user = await this.load(subject);
    if (user.mfaEnabledAt) {
      throw badRequest('mfa_already_enabled', 'Two-step sign-in is already on');
    }
    const secret = newTotpSecret();
    await this.save(subject, { mfaSecretEnc: this.cipher.encrypt(secret, this.context(subject)) });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email ?? subject.id) };
  }

  /** Turns it on once the app shows a matching code. Returns the recovery codes, shown once. */
  async confirm(subject: Subject, code: string): Promise<string[]> {
    const user = await this.load(subject);
    if (user.mfaEnabledAt) {
      throw badRequest('mfa_already_enabled', 'Two-step sign-in is already on');
    }
    if (!user.mfaSecretEnc) throw badRequest('mfa_not_started', 'Start the setup first');
    const secret = this.cipher.decrypt(user.mfaSecretEnc, this.context(subject));
    if (!this.use(subject, totpStep(secret, code))) {
      throw badRequest('mfa_wrong_code', 'That code does not match. Check the time on your phone.');
    }
    const codes = newRecoveryCodes();
    await this.save(subject, { mfaEnabledAt: new Date(), mfaRecoveryCodes: codes.map(hashCode) });
    return codes;
  }

  /** Whether a code (from the app, or a recovery code) is right; a recovery code is used up. */
  async check(subject: Subject, code: string): Promise<boolean> {
    const user = await this.load(subject);
    if (!user.mfaEnabledAt || !user.mfaSecretEnc) return false;
    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed)) {
      const secret = this.cipher.decrypt(user.mfaSecretEnc, this.context(subject));
      return this.use(subject, totpStep(secret, trimmed));
    }
    const hash = hashCode(trimmed);
    if (!user.mfaRecoveryCodes.includes(hash)) return false;
    await this.save(subject, { mfaRecoveryCodes: user.mfaRecoveryCodes.filter((h) => h !== hash) });
    return true;
  }

  /** Takes a right code's step unless this login already used it (or a later one). */
  private use(subject: Subject, step: number | undefined): boolean {
    if (step === undefined) return false;
    const now = Date.now();
    for (const [key, last] of this.lastSteps) if (last.until <= now) this.lastSteps.delete(key);
    const key = `${subject.kind}:${subject.id}`;
    const last = this.lastSteps.get(key);
    if (last && step <= last.step) return false;
    this.lastSteps.set(key, { step, until: now + STEP_MEMORY_MS });
    return true;
  }

  async disable(subject: Subject): Promise<void> {
    await this.save(subject, { mfaSecretEnc: null, mfaEnabledAt: null, mfaRecoveryCodes: [] });
  }

  private context(subject: Subject) {
    return {
      tenantId: subject.kind === 'tenant' ? subject.tenantId : 'platform',
      field: CIPHER_FIELDS.mfaSecret,
    };
  }

  private async load(subject: Subject): Promise<MfaColumns> {
    const [row] =
      subject.kind === 'platform'
        ? await this.db
            .select(mfaColumns(platformUsers))
            .from(platformUsers)
            .where(eq(platformUsers.id, subject.id))
        : await runAsTenant(this.db, subject.tenantId, (tx) =>
            tx
              .select(mfaColumns(tenantUsers))
              .from(tenantUsers)
              .where(eq(tenantUsers.id, subject.id)),
          );
    if (!row) throw badRequest('user_not_found', 'This login no longer exists');
    return row;
  }

  private async save(subject: Subject, patch: Partial<Omit<MfaColumns, 'email'>>): Promise<void> {
    if (subject.kind === 'platform') {
      await this.db.update(platformUsers).set(patch).where(eq(platformUsers.id, subject.id));
    } else {
      await runAsTenant(this.db, subject.tenantId, (tx) =>
        tx.update(tenantUsers).set(patch).where(eq(tenantUsers.id, subject.id)),
      );
    }
  }
}
