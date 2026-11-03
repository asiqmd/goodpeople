import { Inject, Injectable } from '@nestjs/common';
import {
  CIPHER_FIELDS,
  authSessions,
  platformUsers,
  runAsTenant,
  tenantUsers,
  type Database,
  type FieldCipher,
} from '@gp/db';
import type { MfaSetup } from '@gp/shared';
import { and, eq, sql } from 'drizzle-orm';
import { SecurityState } from '../../common/security-state.js';
import { badRequest } from '../../common/errors.js';
import { DB, FIELD_CIPHER } from '../../db/db.module.js';
import { hashCode, newRecoveryCodes, newTotpSecret, otpauthUrl, totpStep } from './totp.js';

/** A tenant login or a platform login: they live in different tables. */
export type Subject = (
  { kind: 'platform'; id: string } | { kind: 'tenant'; id: string; tenantId: string }
) & { revision?: number };

interface MfaColumns {
  email: string | null;
  mfaSecretEnc: string | null;
  mfaEnabledAt: Date | null;
  mfaLastStep: number | null;
  mfaRecoveryCodes: string[];
}

const mfaColumns = (table: typeof platformUsers | typeof tenantUsers) => ({
  email: table.email,
  mfaSecretEnc: table.mfaSecretEnc,
  mfaEnabledAt: table.mfaEnabledAt,
  mfaLastStep: table.mfaLastStep,
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
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly state: SecurityState,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** Starts (or restarts) setup: a new secret that is not in force until confirmed. */
  async begin(subject: Subject): Promise<MfaSetup> {
    const user = await this.load(subject);
    if (user.mfaEnabledAt) {
      throw badRequest('mfa_already_enabled', 'Two-step sign-in is already on');
    }
    const secret = newTotpSecret();
    await this.state.remove(`totp:${subject.kind}:${subject.id}`);
    await this.save(subject, {
      mfaSecretEnc: this.cipher.encrypt(secret, this.context(subject)),
      mfaLastStep: null,
    });
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
    if (!(await this.use(subject, totpStep(secret, code)))) {
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
    const table = subject.kind === 'platform' ? platformUsers : tenantUsers;
    const consume = (tx: Database | import('@gp/db').Tx) =>
      tx
        .update(table)
        .set({ mfaRecoveryCodes: sql`array_remove(${table.mfaRecoveryCodes}, ${hash})` })
        .where(
          and(eq(table.id, subject.id), sql`${table.mfaRecoveryCodes} @> ARRAY[${hash}]::text[]`),
        )
        .returning({ id: table.id });
    const used =
      subject.kind === 'platform'
        ? await consume(this.db)
        : await runAsTenant(this.db, subject.tenantId, consume);
    return used.length === 1;
  }

  /** Takes a right code's step unless this login already used it (or a later one). */
  private async use(subject: Subject, step: number | undefined): Promise<boolean> {
    if (step === undefined) return false;
    if (!(await this.state.advance(`totp:${subject.kind}:${subject.id}`, step, STEP_MEMORY_MS)))
      return false;
    const table = subject.kind === 'platform' ? platformUsers : tenantUsers;
    const update = (tx: Database | import('@gp/db').Tx) =>
      tx
        .update(table)
        .set({ mfaLastStep: step })
        .where(and(eq(table.id, subject.id), sql`coalesce(${table.mfaLastStep}, -1) < ${step}`))
        .returning({ id: table.id });
    const rows =
      subject.kind === 'platform'
        ? await update(this.db)
        : await runAsTenant(this.db, subject.tenantId, update);
    return rows.length === 1;
  }

  async disable(subject: Subject): Promise<void> {
    await this.state.remove(`totp:${subject.kind}:${subject.id}`);
    const table = subject.kind === 'platform' ? platformUsers : tenantUsers;
    const disable = async (tx: Database | import('@gp/db').Tx) => {
      await tx
        .update(table)
        .set({
          mfaSecretEnc: null,
          mfaEnabledAt: null,
          mfaRecoveryCodes: [],
          mfaLastStep: null,
          authRevision: sql`${table.authRevision}+1`,
        })
        .where(eq(table.id, subject.id));
      await tx
        .update(authSessions)
        .set({ mfaAt: null })
        .where(
          and(eq(authSessions.subjectKind, subject.kind), eq(authSessions.subjectId, subject.id)),
        );
    };
    if (subject.kind === 'platform') await this.db.transaction(disable);
    else await runAsTenant(this.db, subject.tenantId, disable);
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
