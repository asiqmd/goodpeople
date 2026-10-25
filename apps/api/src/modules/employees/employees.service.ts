import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CIPHER_FIELDS,
  designations,
  employeeNominees,
  employeePaymentAccounts,
  employees,
  hashPassword,
  jobAssignments,
  legalEntities,
  locations,
  orgUnits,
  tenantUsers,
  type CipherField,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import { bdProbationEnd } from '@gp/country-packs';
import {
  BD_NID,
  addDays,
  isAdolescentOn,
  todayIn,
  type EmployeeDetail,
  type EmployeeListItem,
  type EmployeeListQuery,
  type HireEmployeeInput,
  type HireResult,
  type IdentityInput,
  type JobAssignmentView,
  type JobChangeInput,
  type JobCorrectionInput,
  type JobInput,
  type NomineesInput,
  type NomineeView,
  type Page,
  type PaymentAccountView,
  type PaymentAccountsInput,
  type TenantWithAccess,
  type UpdateEmployeeInput,
} from '@gp/shared';
import { and, asc, count, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { AttendanceProcessor } from '../attendance/processor.service.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { currentOf, inForceOn, selectAssignments, toJobView } from './employee.queries.js';

type EmployeeRow = typeof employees.$inferSelect;
type PersonalInput = Omit<UpdateEmployeeInput, 'identity' | 'probationEndsOn'>;

const IDENTITY_FIELDS = {
  nid: { column: 'nidEnc', field: CIPHER_FIELDS.nid },
  birthRegistration: { column: 'birthRegistrationEnc', field: CIPHER_FIELDS.birthRegistration },
  passport: { column: 'passportEnc', field: CIPHER_FIELDS.passport },
  tin: { column: 'tinEnc', field: CIPHER_FIELDS.tin },
} as const;

const blankToNull = (v: string | undefined) => (v === undefined ? undefined : v || null);
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** Personal columns from a hire or update body; keys the body left out stay out. */
function personalColumns(input: PersonalInput): Partial<EmployeeRow> {
  const columns: Partial<EmployeeRow> = {
    fullName: input.fullName,
    fullNameBn: blankToNull(input.fullNameBn),
    fatherName: input.fatherName,
    motherName: input.motherName,
    spouseName: blankToNull(input.spouseName),
    dateOfBirth: input.dateOfBirth,
    gender: input.gender,
    religion: input.religion,
    maritalStatus: input.maritalStatus,
    bloodGroup: input.bloodGroup,
    nationality: input.nationality,
    mobilePhone: input.mobilePhone,
    workEmail: blankToNull(input.workEmail),
    personalEmail: blankToNull(input.personalEmail),
    presentAddress: input.presentAddress,
    permanentAddress: input.permanentAddress,
    emergencyContact: input.emergencyContact,
  };
  return Object.fromEntries(Object.entries(columns).filter(([, v]) => v !== undefined));
}

type JobRow = typeof jobAssignments.$inferSelect;
type JobChanges = JobChangeInput['changes'];

const JOB_FIELDS = [
  'legalEntityId',
  'locationId',
  'orgUnitId',
  'designationId',
  'gradeId',
  'costCentreId',
  'managerId',
  'employmentType',
  'workerCategory',
] as const;

const jobFields = (row: JobRow) =>
  Object.fromEntries(JOB_FIELDS.map((k) => [k, row[k]])) as Pick<
    JobRow,
    (typeof JOB_FIELDS)[number]
  >;

/** A row's job fields with the changes applied: undefined keeps a value, null clears it. */
function applyJobChanges(row: JobRow, c: JobChanges, event: JobRow['event']) {
  const keep = <K extends keyof JobChanges & keyof JobRow>(key: K) =>
    c[key] === undefined ? row[key] : c[key];
  return {
    legalEntityId: c.legalEntityId ?? row.legalEntityId,
    locationId: keep('locationId') as string | null,
    orgUnitId: keep('orgUnitId') as string | null,
    designationId: keep('designationId') as string | null,
    gradeId: keep('gradeId') as string | null,
    costCentreId: keep('costCentreId') as string | null,
    managerId: keep('managerId') as string | null,
    // Confirming a probationer makes them permanent unless the change says otherwise.
    employmentType:
      c.employmentType ??
      (event === 'confirmation' && row.employmentType === 'probationer'
        ? 'permanent'
        : row.employmentType),
    workerCategory: c.workerCategory ?? row.workerCategory,
  };
}

/**
 * After an earlier entry changes from `before` to `after`, later entries that still had the
 * old value of a field get the new one; a field a later entry changed itself stays. Returns
 * how many entries changed.
 */
async function carryForward(
  tx: Tx,
  later: JobRow[],
  before: JobRow,
  after: ReturnType<typeof applyJobChanges>,
): Promise<number> {
  let changed = 0;
  const previous: Record<string, unknown> = { ...before };
  for (const row of later) {
    const patch: Record<string, unknown> = {};
    for (const key of JOB_FIELDS) {
      if (previous[key] !== after[key] && row[key] === previous[key]) patch[key] = after[key];
    }
    if (Object.keys(patch).length) {
      await tx.update(jobAssignments).set(patch).where(eq(jobAssignments.id, row.id));
      changed += 1;
    }
  }
  return changed;
}

/**
 * Employee records. Every query runs through TenantDb (row-level security) and identity and
 * account numbers are encrypted before they reach the database.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly attendance: AttendanceProcessor,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  list(query: EmployeeListQuery): Promise<Page<EmployeeListItem>> {
    const today = todayIn();
    return this.tenantDb.run(async (tx) => {
      const conditions: SQL[] = [];
      if (query.status) conditions.push(eq(employees.status, query.status));
      if (query.search) {
        const like = `%${escapeLike(query.search)}%`;
        const matches = [
          ilike(employees.fullName, like),
          ilike(employees.fullNameBn, like),
          ilike(employees.employeeCode, like),
          ilike(employees.mobilePhone, like),
        ];
        // An NID is never stored in plain text: look it up by its blind index.
        if (BD_NID.test(query.search)) {
          matches.push(eq(employees.nidHash, this.blindIndex(query.search, CIPHER_FIELDS.nid)));
        }
        conditions.push(or(...matches)!);
      }
      if (query.legalEntityId)
        conditions.push(eq(jobAssignments.legalEntityId, query.legalEntityId));
      if (query.locationId) conditions.push(eq(jobAssignments.locationId, query.locationId));
      if (query.orgUnitId) {
        conditions.push(
          inArray(jobAssignments.orgUnitId, await this.unitAndBelow(tx, query.orgUnitId)),
        );
      }
      const where = conditions.length ? and(...conditions) : undefined;
      const current = and(eq(jobAssignments.employeeId, employees.id), inForceOn(today));

      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(employees)
        .leftJoin(jobAssignments, current)
        .where(where);
      const rows = await tx
        .select({
          e: employees,
          a: jobAssignments,
          legalEntity: { id: legalEntities.id, name: legalEntities.name },
          orgUnit: { id: orgUnits.id, name: orgUnits.name },
          designation: { id: designations.id, name: designations.name },
          location: { id: locations.id, name: locations.name },
        })
        .from(employees)
        .leftJoin(jobAssignments, current)
        .leftJoin(legalEntities, eq(legalEntities.id, jobAssignments.legalEntityId))
        .leftJoin(orgUnits, eq(orgUnits.id, jobAssignments.orgUnitId))
        .leftJoin(designations, eq(designations.id, jobAssignments.designationId))
        .leftJoin(locations, eq(locations.id, jobAssignments.locationId))
        .where(where)
        .orderBy(asc(employees.employeeCode))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      return {
        items: rows.map(({ e, a, legalEntity, orgUnit, designation, location }) => ({
          id: e.id,
          employeeCode: e.employeeCode,
          fullName: e.fullName,
          fullNameBn: e.fullNameBn,
          status: e.status,
          joinedOn: e.joinedOn,
          legalEntity,
          orgUnit,
          designation,
          location,
          employmentType: a?.employmentType ?? null,
          isAdolescent: isAdolescentOn(e.dateOfBirth, today),
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  /** `revealIdentity` false masks identity numbers to their last four digits. */
  async get(id: string, revealIdentity = true): Promise<EmployeeDetail> {
    const detail = await this.tenantDb.run((tx) =>
      this.detail(tx, eq(employees.id, id), revealIdentity),
    );
    if (!detail) throw new NotFoundException('Employee not found');
    return detail;
  }

  /** The signed-in user's own record. */
  async mine(user: AuthUser): Promise<EmployeeDetail> {
    const detail = await this.tenantDb.run((tx) => this.detail(tx, eq(employees.userId, user.id)));
    if (!detail) throw new NotFoundException('No employee record is linked to your login');
    return detail;
  }

  history(id: string): Promise<JobAssignmentView[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await selectAssignments(tx, eq(jobAssignments.employeeId, id));
      if (rows.length === 0) throw new NotFoundException('Employee not found');
      return rows.map(toJobView);
    });
  }

  async hire(
    actor: AuthUser,
    tenant: TenantWithAccess,
    input: HireEmployeeInput,
  ): Promise<HireResult> {
    const limit = tenant.access.limits.max_employees;
    const portal = input.portalAccess;
    // A login with only a mobile number signs in by SMS code and has no password.
    const password = portal?.email
      ? (portal.password ?? randomBytes(12).toString('base64url'))
      : undefined;
    const passwordHash = password ? await hashPassword(password) : undefined;

    const id = await this.tenantDb.run(async (tx) => {
      await this.checkLimit(tx, limit, 1);
      return this.insertHire(tx, actor, input, passwordHash);
    });

    return {
      employee: await this.get(id),
      ...(password && !portal?.password ? { temporaryPassword: password } : {}),
    };
  }

  /** Refuses hiring past the plan's active-employee limit. */
  async checkLimit(tx: Tx, limit: number | null, adding: number) {
    if (limit === null) return;
    const [{ value: active } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(employees)
      .where(eq(employees.status, 'active'));
    if (active + adding > limit) {
      throw forbidden('limit_reached', `Your plan allows ${limit} active employees`);
    }
  }

  /** Creates the employee, their first job and any login, inside the caller's transaction. */
  async insertHire(
    tx: Tx,
    actor: AuthUser,
    input: HireEmployeeInput,
    passwordHash?: string,
  ): Promise<string> {
    const portal = input.portalAccess;
    await this.checkJobRefs(tx, input.job);
    const tenantId = currentTenantId();
    const userId = portal
      ? (
          await tx
            .insert(tenantUsers)
            .values({
              tenantId,
              email: portal.email?.toLowerCase() ?? null,
              phone: portal.phone ?? null,
              name: input.fullName,
              passwordHash: passwordHash ?? null,
              role: portal.role,
            })
            .returning({ id: tenantUsers.id })
        )[0]!.id
      : null;
    const [row] = await tx
      .insert(employees)
      .values({
        ...(personalColumns(input) as typeof employees.$inferInsert),
        ...this.identityColumns(input.identity),
        tenantId,
        employeeCode: input.employeeCode,
        userId,
        joinedOn: input.joinedOn,
        // A probationer's probation defaults to the statutory period (s.4).
        probationEndsOn:
          input.probationEndsOn ??
          (input.job.employmentType === 'probationer'
            ? bdProbationEnd(
                input.joinedOn,
                input.job.workerCategory === 'staff' ? 'clerical' : 'other',
              )
            : null),
        confirmedOn: input.job.employmentType === 'permanent' ? input.joinedOn : null,
      })
      .returning({ id: employees.id });
    await tx.insert(jobAssignments).values({
      ...input.job,
      tenantId,
      employeeId: row!.id,
      event: 'hire',
      effectiveFrom: input.joinedOn,
      reason: 'Joined',
      createdBy: actor.id,
    });
    await this.audit.record(tx, {
      actorUserId: actor.id,
      action: 'employee.hire',
      entityType: 'employee',
      entityId: row!.id,
      after: {
        employeeCode: input.employeeCode,
        fullName: input.fullName,
        joinedOn: input.joinedOn,
        job: input.job,
        portalAccess: portal
          ? { email: portal.email ?? null, phone: portal.phone ?? null, role: portal.role }
          : null,
      },
    });
    return row!.id;
  }

  async update(actor: AuthUser, id: string, input: UpdateEmployeeInput): Promise<EmployeeDetail> {
    const { identity, probationEndsOn, ...personal } = input;
    await this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(employees)
        .set({
          ...personalColumns(personal),
          ...(identity ? this.identityColumns(identity) : {}),
          ...(probationEndsOn !== undefined ? { probationEndsOn } : {}),
          updatedAt: new Date(),
        })
        .where(eq(employees.id, id))
        .returning({ id: employees.id });
      if (!row) throw new NotFoundException('Employee not found');
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'employee.update',
        entityType: 'employee',
        entityId: id,
        // Field names only: never write identity numbers into the audit log.
        after: {
          fields: Object.keys(personal),
          identity: identity ? Object.keys(identity) : [],
          probationEndsOn,
        },
      });
    });
    return this.get(id);
  }

  /**
   * Records a job event from a date. The assignment in force then ends the day before and a
   * new one starts, carrying over whatever the change leaves out. A date before the latest
   * change is a back-dated change: later assignments take the new values too, unless they
   * changed those fields themselves.
   */
  async changeJob(actor: AuthUser, id: string, input: JobChangeInput): Promise<EmployeeDetail> {
    await this.tenantDb.run(async (tx) => {
      const [employee] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, id))
        .for('update');
      if (!employee) throw new NotFoundException('Employee not found');
      if (employee.status !== 'active') {
        throw new ConflictException('This employee has separated');
      }
      const history = await tx
        .select()
        .from(jobAssignments)
        .where(eq(jobAssignments.employeeId, id))
        .orderBy(asc(jobAssignments.effectiveFrom));
      if (history.length === 0) {
        throw new ConflictException('This employee has no job assignment');
      }
      const date = input.effectiveFrom;
      if (date < employee.joinedOn) {
        throw new BadRequestException(
          `The change cannot be before joining on ${employee.joinedOn}`,
        );
      }
      const target = history.find(
        (r) => r.effectiveFrom <= date && (r.effectiveTo === null || r.effectiveTo >= date),
      );
      if (!target) throw new ConflictException(`No job assignment is in force on ${date}`);
      if (target.effectiveFrom === date) {
        throw new BadRequestException(
          `A change already takes effect on ${date}; correct that entry instead`,
        );
      }
      if (input.changes.managerId === id) {
        throw new BadRequestException('An employee cannot report to themself');
      }
      const next = applyJobChanges(target, input.changes, input.event);
      await this.checkJobRefs(tx, next);

      await tx
        .update(jobAssignments)
        .set({ effectiveTo: addDays(date, -1) })
        .where(eq(jobAssignments.id, target.id));
      await tx.insert(jobAssignments).values({
        ...next,
        tenantId: currentTenantId(),
        employeeId: id,
        event: input.event,
        effectiveFrom: date,
        effectiveTo: target.effectiveTo,
        reason: input.reason,
        createdBy: actor.id,
      });
      const carried = await carryForward(
        tx,
        history.filter((r) => r.effectiveFrom > date),
        target,
        next,
      );
      if (input.event === 'confirmation') {
        await tx
          .update(employees)
          .set({ confirmedOn: date, updatedAt: new Date() })
          .where(eq(employees.id, id));
      }
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: `employee.job.${input.event}`,
        entityType: 'employee',
        entityId: id,
        before: jobFields(target),
        after: {
          ...next,
          event: input.event,
          effectiveFrom: date,
          reason: input.reason,
          backDated: target.effectiveTo !== null,
          laterRowsUpdated: carried,
        },
      });
      await this.attendance.processSince(tx, [id], date);
    });
    return this.get(id);
  }

  /**
   * Corrects a job history entry in place, for mistakes rather than real changes. Later
   * entries take the corrected values too, unless they changed those fields themselves.
   */
  async correctJob(
    actor: AuthUser,
    id: string,
    jobId: string,
    input: JobCorrectionInput,
  ): Promise<EmployeeDetail> {
    await this.tenantDb.run(async (tx) => {
      const history = await tx
        .select()
        .from(jobAssignments)
        .where(eq(jobAssignments.employeeId, id))
        .orderBy(asc(jobAssignments.effectiveFrom));
      const row = history.find((r) => r.id === jobId);
      if (!row) throw new NotFoundException('Job history entry not found');
      if (input.changes.managerId === id) {
        throw new BadRequestException('An employee cannot report to themself');
      }
      const next = applyJobChanges(row, input.changes, row.event);
      await this.checkJobRefs(tx, next);
      await tx.update(jobAssignments).set(next).where(eq(jobAssignments.id, jobId));
      const carried = await carryForward(
        tx,
        history.filter((r) => r.effectiveFrom > row.effectiveFrom),
        row,
        next,
      );
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'employee.job.correct',
        entityType: 'employee',
        entityId: id,
        before: jobFields(row),
        after: { ...next, jobId, reason: input.reason, laterRowsUpdated: carried },
      });
      await this.attendance.processSince(tx, [id], row.effectiveFrom);
    });
    return this.get(id);
  }

  async replaceNominees(actor: AuthUser, id: string, input: NomineesInput): Promise<NomineeView[]> {
    return this.tenantDb.run(async (tx) => {
      await this.mustExist(tx, id);
      await tx.delete(employeeNominees).where(eq(employeeNominees.employeeId, id));
      const rows = input.length
        ? await tx
            .insert(employeeNominees)
            .values(
              input.map((n) => ({
                tenantId: currentTenantId(),
                employeeId: id,
                name: n.name,
                relation: n.relation,
                sharePercent: n.sharePercent,
                dateOfBirth: n.dateOfBirth ?? null,
                phone: n.phone ?? null,
              })),
            )
            .returning()
        : [];
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'employee.nominees.replace',
        entityType: 'employee',
        entityId: id,
        after: input.map((n) => ({
          name: n.name,
          relation: n.relation,
          sharePercent: n.sharePercent,
        })),
      });
      return rows.map(toNomineeView);
    });
  }

  async replacePaymentAccounts(
    actor: AuthUser,
    id: string,
    input: PaymentAccountsInput,
  ): Promise<PaymentAccountView[]> {
    return this.tenantDb.run(async (tx) => {
      await this.mustExist(tx, id);
      // Full numbers never leave the server, so an edited account that comes back without one
      // keeps the number already stored for it.
      const existing = new Map(
        (
          await tx
            .select()
            .from(employeePaymentAccounts)
            .where(eq(employeePaymentAccounts.employeeId, id))
        ).map((a) => [a.id, a]),
      );
      for (const a of input) {
        if (a.id && !a.accountNumber && !existing.has(a.id)) {
          throw new BadRequestException('Unknown payment account; enter its number again');
        }
      }
      await tx.delete(employeePaymentAccounts).where(eq(employeePaymentAccounts.employeeId, id));
      const rows = input.length
        ? await tx
            .insert(employeePaymentAccounts)
            .values(
              input.map((a) => {
                const number = a.accountNumber ? digitsOnly(a.accountNumber) : null;
                const kept = a.id && !number ? existing.get(a.id) : undefined;
                return {
                  tenantId: currentTenantId(),
                  employeeId: id,
                  method: a.method,
                  provider: a.provider ?? null,
                  branchName: a.branchName ?? null,
                  routingNumber: a.routingNumber ?? null,
                  accountName: a.accountName ?? null,
                  accountNumberEnc: number
                    ? this.encrypt(number, CIPHER_FIELDS.accountNumber)
                    : (kept?.accountNumberEnc ?? null),
                  accountNumberLast4: number?.slice(-4) ?? kept?.accountNumberLast4 ?? null,
                  isPrimary: a.isPrimary,
                  // The primary account takes what is left; only the others take a fixed part.
                  splitAmount: a.isPrimary ? null : (a.splitAmount ?? null),
                };
              }),
            )
            .returning()
        : [];
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'employee.payment_accounts.replace',
        entityType: 'employee',
        entityId: id,
        after: rows.map((r) => ({
          method: r.method,
          provider: r.provider,
          last4: r.accountNumberLast4,
          isPrimary: r.isPrimary,
        })),
      });
      return rows.map(toPaymentAccountView);
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async detail(tx: Tx, where: SQL, revealIdentity = true): Promise<EmployeeDetail | null> {
    const [e] = await tx.select().from(employees).where(where);
    if (!e) return null;
    const today = todayIn();
    const [history, nominees, accounts, [user]] = [
      (await selectAssignments(tx, eq(jobAssignments.employeeId, e.id))).map(toJobView),
      await tx
        .select()
        .from(employeeNominees)
        .where(eq(employeeNominees.employeeId, e.id))
        .orderBy(asc(employeeNominees.createdAt)),
      await tx
        .select()
        .from(employeePaymentAccounts)
        .where(eq(employeePaymentAccounts.employeeId, e.id))
        .orderBy(asc(employeePaymentAccounts.createdAt)),
      e.userId
        ? await tx
            .select({
              id: tenantUsers.id,
              email: tenantUsers.email,
              phone: tenantUsers.phone,
              role: tenantUsers.role,
              disabledAt: tenantUsers.disabledAt,
            })
            .from(tenantUsers)
            .where(eq(tenantUsers.id, e.userId))
        : [],
    ];
    return {
      id: e.id,
      employeeCode: e.employeeCode,
      status: e.status,
      fullName: e.fullName,
      fullNameBn: e.fullNameBn,
      fatherName: e.fatherName,
      motherName: e.motherName,
      spouseName: e.spouseName,
      dateOfBirth: e.dateOfBirth,
      gender: e.gender,
      religion: e.religion,
      maritalStatus: e.maritalStatus,
      bloodGroup: e.bloodGroup,
      nationality: e.nationality,
      mobilePhone: e.mobilePhone,
      workEmail: e.workEmail,
      personalEmail: e.personalEmail,
      presentAddress: e.presentAddress,
      permanentAddress: e.permanentAddress,
      emergencyContact: e.emergencyContact,
      identity: {
        nid: this.reveal(e.nidEnc, CIPHER_FIELDS.nid, revealIdentity),
        birthRegistration: this.reveal(
          e.birthRegistrationEnc,
          CIPHER_FIELDS.birthRegistration,
          revealIdentity,
        ),
        passport: this.reveal(e.passportEnc, CIPHER_FIELDS.passport, revealIdentity),
        tin: this.reveal(e.tinEnc, CIPHER_FIELDS.tin, revealIdentity),
      },
      joinedOn: e.joinedOn,
      probationEndsOn: e.probationEndsOn,
      confirmedOn: e.confirmedOn,
      separatedOn: e.separatedOn,
      isAdolescent: isAdolescentOn(e.dateOfBirth, today),
      currentJob: currentOf(history, today),
      nominees: nominees.map(toNomineeView),
      paymentAccounts: accounts.map(toPaymentAccountView),
      portalUser: user
        ? {
            id: user.id,
            email: user.email,
            phone: user.phone,
            role: user.role,
            disabled: !!user.disabledAt,
          }
        : null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  /** An org unit or location must belong to the job's legal entity. */
  private async checkJobRefs(
    tx: Tx,
    job: Pick<JobInput, 'legalEntityId'> & {
      orgUnitId?: string | null;
      locationId?: string | null;
    },
  ) {
    if (job.orgUnitId) {
      const [unit] = await tx.select().from(orgUnits).where(eq(orgUnits.id, job.orgUnitId));
      if (unit && unit.legalEntityId !== job.legalEntityId) {
        throw new BadRequestException('The org unit belongs to another legal entity');
      }
    }
    if (job.locationId) {
      const [location] = await tx.select().from(locations).where(eq(locations.id, job.locationId));
      if (location && location.legalEntityId !== job.legalEntityId) {
        throw new BadRequestException('The location belongs to another legal entity');
      }
    }
  }

  private async unitAndBelow(tx: Tx, unitId: string): Promise<string[]> {
    const all = await tx.select({ id: orgUnits.id, parentId: orgUnits.parentId }).from(orgUnits);
    const ids = [unitId];
    for (let i = 0; i < ids.length; i++) {
      ids.push(...all.filter((u) => u.parentId === ids[i]).map((u) => u.id));
    }
    return ids;
  }

  private async mustExist(tx: Tx, id: string) {
    const [row] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, id));
    if (!row) throw new NotFoundException('Employee not found');
  }

  /** Encrypted columns for the identity numbers present: a value sets, null clears. */
  private identityColumns(identity: IdentityInput): Partial<EmployeeRow> {
    const columns: Partial<EmployeeRow> = {};
    for (const [key, { column, field }] of Object.entries(IDENTITY_FIELDS) as [
      keyof IdentityInput,
      (typeof IDENTITY_FIELDS)[keyof typeof IDENTITY_FIELDS],
    ][]) {
      const value = identity[key];
      if (value === undefined) continue;
      columns[column] = value === null ? null : this.encrypt(value, field);
      if (key === 'nid') columns.nidHash = value === null ? null : this.blindIndex(value, field);
    }
    return columns;
  }

  private encrypt(value: string, field: CipherField) {
    return this.cipher.encrypt(value, { tenantId: currentTenantId(), field });
  }

  /** An identity number in clear, or only its last four digits for roles without the permission. */
  private reveal(value: string | null, field: CipherField, reveal: boolean) {
    const plain = this.decrypt(value, field);
    return plain === null || reveal ? plain : `••••${plain.slice(-4)}`;
  }

  private decrypt(value: string | null, field: CipherField) {
    return value === null
      ? null
      : this.cipher.decrypt(value, { tenantId: currentTenantId(), field });
  }

  private blindIndex(value: string, field: CipherField) {
    return this.cipher.blindIndex(value, { tenantId: currentTenantId(), field });
  }
}

const toNomineeView = (n: typeof employeeNominees.$inferSelect): NomineeView => ({
  id: n.id,
  name: n.name,
  relation: n.relation,
  sharePercent: n.sharePercent,
  dateOfBirth: n.dateOfBirth,
  phone: n.phone,
});

const toPaymentAccountView = (
  a: typeof employeePaymentAccounts.$inferSelect,
): PaymentAccountView => ({
  id: a.id,
  method: a.method,
  provider: a.provider,
  branchName: a.branchName,
  routingNumber: a.routingNumber,
  accountName: a.accountName,
  accountNumberMasked: a.accountNumberLast4 ? `•••• ${a.accountNumberLast4}` : null,
  isPrimary: a.isPrimary,
  splitAmount: a.splitAmount,
});
