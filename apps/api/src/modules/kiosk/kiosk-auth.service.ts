import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  employees,
  hashPassword,
  kioskPinCodes,
  notificationDeliveries,
  runAsTenant,
  tenantUsers,
  verifyPassword,
  type Database,
  type Tx,
} from '@gp/db';
import {
  KIOSK_CODE_LENGTH,
  KIOSK_CODE_MAX_ATTEMPTS,
  KIOSK_CODE_TTL_MINUTES,
  KIOSK_SESSION_SECONDS,
  smsSegments,
  todayIn,
  type ApiError,
  type KioskPinRequestInput,
  type KioskPinRequestResult,
  type KioskPinSetInput,
  type KioskSession,
  type KioskSignInInput,
  type TenantWithAccess,
  type UserLanguage,
} from '@gp/shared';
import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { badRequest } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB, TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { hashCode, numericCode } from '../auth/totp.js';
import { DEFAULT_TEMPLATES } from '../notifications/default-templates.js';
import { fill } from '../notifications/notifications.service.js';
import { SMS_SENDER, type Sender, type SmsMessage } from '../notifications/senders.js';
import { phoneEnding } from './kiosk-tokens.js';
import { EndedSessions, KioskPause, PinLockout } from './kiosk-state.js';
import type { KioskIdentity } from './kiosks.service.js';

type EmployeeRow = typeof employees.$inferSelect;

/** A signed-in worker: who, and the session that proves it. */
export interface KioskWorker {
  employeeId: string;
  sessionId: string;
  expiresAt: number;
}

interface KioskSessionPayload {
  typ: 'kiosk';
  sub: string;
  tid: string;
  kid: string;
  jti: string;
  exp: number;
}

const MINUTE_MS = 60_000;
const WINDOW_MS = 15 * MINUTE_MS;
/** PIN codes per worker per day, on top of the per-15-minute limit. */
const CODES_PER_DAY = 10;

const failure = (status: number, error: string, code: string, message: string): ApiError => ({
  statusCode: status,
  error,
  message,
  code,
});
const signInFailed = () =>
  new UnauthorizedException(
    failure(401, 'Unauthorized', 'kiosk_sign_in_failed', 'Wrong ID card code or PIN'),
  );
const sessionEnded = () =>
  new UnauthorizedException(
    failure(401, 'Unauthorized', 'kiosk_session_ended', 'Sign in again with your card and PIN'),
  );
const inactive = () =>
  new ForbiddenException(
    failure(403, 'Forbidden', 'kiosk_employee_inactive', 'This worker cannot use the kiosk'),
  );
function locked(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return new HttpException(
    {
      ...failure(
        429,
        'Too Many Requests',
        'kiosk_locked',
        `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      ),
      retryAfterSeconds,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/** Too many wrong PINs at this kiosk, across workers: it takes no sign-ins for a while. */
function paused(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return new HttpException(
    {
      ...failure(
        429,
        'Too Many Requests',
        'kiosk_paused',
        `Too many wrong PINs on this kiosk. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      ),
      retryAfterSeconds,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/** The employee an ID card's code names. Typed codes may differ in case from the record. */
async function employeeByCode(tx: Tx, code: string): Promise<EmployeeRow | null> {
  const [row] = await tx
    .select()
    .from(employees)
    .where(sql`lower(${employees.employeeCode}) = lower(${code})`)
    .orderBy(sql`${employees.employeeCode} = ${code} desc`)
    .limit(1);
  return row ?? null;
}

/** Workers who have left, or whose login HR disabled, are refused at kiosks. */
async function mayUseKiosk(tx: Tx, employee: EmployeeRow): Promise<boolean> {
  if (employee.status !== 'active') return false;
  if (employee.separatedOn && employee.separatedOn < todayIn()) return false;
  if (!employee.userId) return true;
  const [login] = await tx
    .select({ disabledAt: tenantUsers.disabledAt })
    .from(tenantUsers)
    .where(eq(tenantUsers.id, employee.userId));
  return !login?.disabledAt;
}

/**
 * Workers at a kiosk: setting a PIN with a code sent by SMS, signing in with the ID card's
 * code and the PIN, and the short session that follows.
 */
@Injectable()
export class KioskAuthService {
  private readonly logger = new Logger(KioskAuthService.name);
  /** Checked against when a code has no PIN, so a wrong code answers as slowly as a wrong PIN. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SMS_SENDER) private readonly sms: Sender<SmsMessage>,
    private readonly tenantDb: TenantDb,
    private readonly jwt: JwtService,
    private readonly limiter: RateLimiter,
    private readonly lockout: PinLockout,
    private readonly pause: KioskPause,
    private readonly ended: EndedSessions,
    private readonly audit: TenantAuditService,
  ) {}

  // ── PIN codes ──────────────────────────────────────────────────────────────

  /**
   * Sends a code to the worker's mobile number. The answer is the same whether or not the
   * code names anyone: always "sent", with two digits that are the number's own when it does
   * and fixed made-up ones when it does not. ID card codes are printed and often sequential,
   * so two digits of a number say little; they let the worker check which phone to look at.
   */
  async requestPin(
    kiosk: KioskIdentity,
    tenant: TenantWithAccess,
    input: KioskPinRequestInput,
  ): Promise<KioskPinRequestResult> {
    await this.limiter.hit(`kiosk-pin:${kiosk.kioskId}`, 40, WINDOW_MS);
    await this.limiter.hit(
      `kiosk-pin:${kiosk.tenantId}:${input.employeeCode.toLowerCase()}`,
      3,
      WINDOW_MS,
    );
    const code = numericCode(KIOSK_CODE_LENGTH);
    const target = await this.tenantDb.run(async (tx) => {
      const employee = await employeeByCode(tx, input.employeeCode);
      if (!employee || !(await mayUseKiosk(tx, employee))) return null;
      const [today] = await tx
        .select({ n: count() })
        .from(kioskPinCodes)
        .where(
          and(
            eq(kioskPinCodes.employeeId, employee.id),
            gt(kioskPinCodes.createdAt, new Date(Date.now() - 24 * 60 * MINUTE_MS)),
          ),
        );
      const send = (today?.n ?? 0) < CODES_PER_DAY;
      if (send) {
        await tx.insert(kioskPinCodes).values({
          tenantId: kiosk.tenantId,
          employeeId: employee.id,
          kioskId: kiosk.kioskId,
          codeHash: hashCode(code),
          expiresAt: new Date(Date.now() + KIOSK_CODE_TTL_MINUTES * MINUTE_MS),
        });
      }
      return { phone: employee.mobilePhone, send, language: await this.languageOf(tx, employee) };
    });
    if (target?.send) {
      // Not awaited: waiting for the SMS gateway would make real codes answer more slowly.
      void this.sendCode(kiosk.tenantId, target.phone, code, target.language, tenant.name).catch(
        (error: unknown) => this.logger.error('Sending a kiosk PIN code failed', error as Error),
      );
    }
    return {
      sent: true,
      expiresInSeconds: KIOSK_CODE_TTL_MINUTES * 60,
      phoneEnding: phoneEnding(
        target?.phone ?? null,
        this.config.JWT_ACCESS_SECRET,
        kiosk.tenantId,
        input.employeeCode,
      ),
    };
  }

  /** Sets the PIN with the latest code; five wrong tries or ten minutes finish a code. */
  async setPin(kiosk: KioskIdentity, input: KioskPinSetInput): Promise<void> {
    await this.limiter.hit(`kiosk-pin-set:${kiosk.kioskId}`, 60, WINDOW_MS);
    await this.limiter.hit(
      `kiosk-pin-set:${kiosk.tenantId}:${input.employeeCode.toLowerCase()}`,
      10,
      WINDOW_MS,
    );
    const pinHash = await hashPassword(input.pin);
    const employeeId = await this.tenantDb.run(async (tx) => {
      const employee = await employeeByCode(tx, input.employeeCode);
      if (!employee) return null;
      const [challenge] = await tx
        .select()
        .from(kioskPinCodes)
        .where(
          and(
            eq(kioskPinCodes.employeeId, employee.id),
            isNull(kioskPinCodes.usedAt),
            gt(kioskPinCodes.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(kioskPinCodes.createdAt))
        .limit(1)
        .for('update');
      if (!challenge) return null;
      const attempts = challenge.attempts + 1;
      const right = timingSafeEqual(
        Buffer.from(hashCode(input.code)),
        Buffer.from(challenge.codeHash),
      );
      await tx
        .update(kioskPinCodes)
        .set({
          attempts,
          // Used, or too many wrong guesses: either way this code is finished.
          usedAt: right || attempts >= KIOSK_CODE_MAX_ATTEMPTS ? new Date() : null,
        })
        .where(eq(kioskPinCodes.id, challenge.id));
      if (!right || !(await mayUseKiosk(tx, employee))) return null;
      await tx
        .update(employees)
        .set({ kioskPinHash: pinHash, kioskPinSetAt: new Date() })
        .where(eq(employees.id, employee.id));
      await this.audit.record(tx, {
        // The worker's own login when they have one; otherwise the kiosk acted for them.
        actorUserId: employee.userId ?? kiosk.kioskId,
        action: 'kiosk.pin.set',
        entityType: 'employee',
        entityId: employee.id,
        after: { kioskId: kiosk.kioskId },
      });
      return employee.id;
    });
    if (!employeeId) throw badRequest('kiosk_code_wrong', 'Wrong or expired code');
    // Proving the phone again lifts a lock from forgotten PINs.
    await this.lockout.reset(`${kiosk.kioskId}:${employeeId}`);
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  async signIn(kiosk: KioskIdentity, input: KioskSignInInput): Promise<KioskSession> {
    await this.limiter.hit(`kiosk-sign-in:${kiosk.kioskId}`, 200, WINDOW_MS);
    const pausedFor = await this.pause.pausedFor(kiosk.kioskId);
    if (pausedFor) throw paused(pausedFor);
    const employee = await this.tenantDb.run((tx) => employeeByCode(tx, input.employeeCode));
    if (!employee?.kioskPinHash) {
      await verifyPassword(await (this.dummyHash ??= hashPassword(randomUUID())), input.pin);
      const pause = await this.pause.fail(kiosk.kioskId);
      throw pause ? paused(pause) : signInFailed();
    }
    const key = `${kiosk.kioskId}:${employee.id}`;
    const lockedFor = await this.lockout.lockedFor(key);
    if (lockedFor) throw locked(lockedFor);
    if (!(await verifyPassword(employee.kioskPinHash, input.pin))) {
      const lock = await this.lockout.fail(key);
      const pause = await this.pause.fail(kiosk.kioskId);
      throw pause ? paused(pause) : lock ? locked(lock) : signInFailed();
    }
    await this.lockout.reset(key);
    if (!(await this.tenantDb.run((tx) => mayUseKiosk(tx, employee)))) throw inactive();
    const payload: Omit<KioskSessionPayload, 'exp' | 'jti'> = {
      typ: 'kiosk',
      sub: employee.id,
      tid: kiosk.tenantId,
      kid: kiosk.kioskId,
    };
    return {
      sessionToken: await this.jwt.signAsync(payload, {
        expiresIn: KIOSK_SESSION_SECONDS,
        jwtid: randomUUID(),
      }),
      expiresInSeconds: KIOSK_SESSION_SECONDS,
      employee: {
        code: employee.employeeCode,
        name: employee.fullName,
        nameBn: employee.fullNameBn,
      },
    };
  }

  /**
   * The worker a session token proves, at the kiosk that started it. Typed tokens are never
   * access tokens, and an access token is never a kiosk session. Runs in a guard, before the
   * request has its tenant context.
   */
  async session(kiosk: KioskIdentity, token: string): Promise<KioskWorker> {
    const payload = token
      ? await this.jwt.verifyAsync<KioskSessionPayload>(token).catch(() => null)
      : null;
    if (
      payload?.typ !== 'kiosk' ||
      payload.tid !== kiosk.tenantId ||
      payload.kid !== kiosk.kioskId ||
      !payload.jti ||
      (await this.ended.has(payload.jti))
    ) {
      throw sessionEnded();
    }
    const allowed = await runAsTenant(this.db, kiosk.tenantId, async (tx) => {
      const [employee] = await tx.select().from(employees).where(eq(employees.id, payload.sub));
      return employee ? mayUseKiosk(tx, employee) : false;
    });
    if (!allowed) throw inactive();
    return { employeeId: payload.sub, sessionId: payload.jti, expiresAt: payload.exp * 1000 };
  }

  async end(worker: KioskWorker): Promise<void> {
    await this.ended.end(worker.sessionId, worker.expiresAt);
  }

  // ── Sending ────────────────────────────────────────────────────────────────

  /** Workers without a login read Bangla; one with a login reads what they chose. */
  private async languageOf(tx: Tx, employee: EmployeeRow): Promise<UserLanguage> {
    if (!employee.userId) return 'bn';
    const [login] = await tx
      .select({ language: tenantUsers.language })
      .from(tenantUsers)
      .where(eq(tenantUsers.id, employee.userId));
    return login?.language ?? 'bn';
  }

  /**
   * The sign-in code's wording with this code's lifetime, recorded with the code hidden. Like
   * sign-in codes, always sent: the workspace's SMS switch and credits do not apply.
   */
  private async sendCode(
    tenantId: string,
    phone: string,
    code: string,
    language: UserLanguage,
    workspaceName: string,
  ): Promise<void> {
    const template = DEFAULT_TEMPLATES['auth.otp'][language];
    const values = {
      'otp.code': code,
      'otp.minutes': String(KIOSK_CODE_TTL_MINUTES),
      'workspace.name': workspaceName,
    };
    const text = fill(template.sms, values, language);
    const id = randomUUID();
    let outcome: { status: 'sent' | 'failed'; providerRef?: string; error?: string };
    try {
      const sent = await this.sms.send({ to: phone, text, reference: id });
      outcome = { status: 'sent', providerRef: sent.providerRef };
    } catch (error) {
      outcome = { status: 'failed', error: (error as Error).message.slice(0, 500) };
    }
    await runAsTenant(this.db, tenantId, (tx) =>
      tx.insert(notificationDeliveries).values({
        id,
        tenantId,
        event: 'auth.otp',
        channel: 'sms',
        recipient: phone,
        body: fill(template.sms, { ...values, 'otp.code': '••••••' }, language),
        status: outcome.status,
        attempts: 1,
        providerRef: outcome.providerRef ?? null,
        lastError: outcome.error ?? null,
        segments: outcome.status === 'sent' ? smsSegments(text) : 0,
        sentAt: outcome.status === 'sent' ? new Date() : null,
      }),
    );
  }
}
