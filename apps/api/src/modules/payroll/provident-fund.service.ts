import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CIPHER_FIELDS, employees, pfEntries, pfMembers, type FieldCipher, type Tx } from '@gp/db';
import { BD_RULES, ruleOn } from '@gp/country-packs';
import {
  addMonths,
  ageOn,
  Decimal,
  money,
  todayIn,
  type PfBalance,
  type PfEntryInput,
  type PfInterestInput,
  type PfJoinInput,
  type PfMemberView,
  type PfStatement,
  type PfVestingStep,
} from '@gp/shared';
import { and, asc, count, eq, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeOfUser } from '../employees/employee.queries.js';
import { payrollSettingsOf } from './payroll-setup.service.js';
import { sealed } from './run-context.js';

/** Each member's balance by account, from their ledger entries up to a date. */
export async function pfBalances(tx: Tx, cipher: FieldCipher, ids: string[], on?: string) {
  const { open } = sealed(cipher);
  const out = new Map<string, { own: Decimal; employer: Decimal }>();
  if (ids.length === 0) return out;
  const rows = await tx
    .select({
      employeeId: pfEntries.employeeId,
      account: pfEntries.account,
      amountEnc: pfEntries.amountEnc,
    })
    .from(pfEntries)
    .where(and(inArray(pfEntries.employeeId, ids), on ? lte(pfEntries.date, on) : undefined));
  for (const r of rows) {
    const b = out.get(r.employeeId) ?? { own: new Decimal(0), employer: new Decimal(0) };
    b[r.account] = b[r.account].plus(open<string>(CIPHER_FIELDS.pfEntries, r.amountEnc));
    out.set(r.employeeId, b);
  }
  return out;
}

/**
 * Ends a membership on a date: the employer's contributions not vested by the years of service
 * go back to the fund, and with `payOut` what is left is paid out (a final settlement).
 */
export async function endMembership(
  tx: Tx,
  cipher: FieldCipher,
  employeeId: string,
  leftOn: string,
  actorId: string,
  options: { payOut: boolean },
) {
  const { seal } = sealed(cipher);
  await tx.update(pfMembers).set({ leftOn }).where(eq(pfMembers.employeeId, employeeId));
  const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId));
  const settings = await payrollSettingsOf(tx);
  const percent = vestedPercent(settings.pfVesting, ageOn(employee!.joinedOn, leftOn));
  const balance = (await pfBalances(tx, cipher, [employeeId])).get(employeeId) ?? {
    own: new Decimal(0),
    employer: new Decimal(0),
  };
  const forfeited = balance.employer
    .times(100 - percent)
    .dividedBy(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const entry = (
    kind: 'forfeited' | 'withdrawal',
    account: 'own' | 'employer',
    amount: Decimal,
    note: string,
  ) => ({
    tenantId: currentTenantId(),
    employeeId,
    date: leftOn,
    kind,
    account,
    amountEnc: seal(CIPHER_FIELDS.pfEntries, money(amount.negated())),
    note,
    createdBy: actorId,
  });
  const rows = [];
  if (forfeited.greaterThan(0)) {
    rows.push(
      entry(
        'forfeited',
        'employer',
        forfeited,
        `${100 - percent}% of the employer's contributions not vested`,
      ),
    );
  }
  const paidOwn = options.payOut ? balance.own : new Decimal(0);
  const paidEmployer = options.payOut ? balance.employer.minus(forfeited) : new Decimal(0);
  if (paidOwn.greaterThan(0))
    rows.push(entry('withdrawal', 'own', paidOwn, 'Paid in the final settlement'));
  if (paidEmployer.greaterThan(0)) {
    rows.push(entry('withdrawal', 'employer', paidEmployer, 'Paid in the final settlement'));
  }
  if (rows.length) await tx.insert(pfEntries).values(rows);
  return { vestedPercent: percent, own: money(paidOwn), employer: money(paidEmployer) };
}

/** The share of the employer's contributions kept after `years` completed years. */
export const vestedPercent = (steps: PfVestingStep[], years: number) =>
  steps.filter((s) => s.afterYears <= years).at(-1)?.percent ?? 0;

const SIZE = 50;

/**
 * The provident fund: who is a member, their ledger (contributions posted by locked runs,
 * opening balances, interest, loans and pay-outs) and what a leaver may take. The rates,
 * whether the fund is recognised and the vesting scale are payroll settings.
 */
@Injectable()
export class ProvidentFundService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** A page of members with their balances; only the page shown is decrypted. */
  members(query: { search?: string; page?: number }) {
    return this.tenantDb.run(async (tx) => {
      const page = Math.max(1, query.page ?? 1);
      const search = query.search ? `%${query.search.replaceAll(/[%_\\]/g, '\\$&')}%` : null;
      const where = search
        ? or(ilike(employees.employeeCode, search), ilike(employees.fullName, search))
        : undefined;
      const [{ total }] = (await tx
        .select({ total: count() })
        .from(pfMembers)
        .innerJoin(employees, eq(employees.id, pfMembers.employeeId))
        .where(where)) as [{ total: number }];
      const rows = await tx
        .select({ member: pfMembers, employee: employees })
        .from(pfMembers)
        .innerJoin(employees, eq(employees.id, pfMembers.employeeId))
        .where(where)
        .orderBy(asc(employees.employeeCode))
        .limit(SIZE)
        .offset((page - 1) * SIZE);
      return { items: await this.memberViews(tx, rows), total, page, size: SIZE };
    });
  }

  statement(employeeId: string): Promise<PfStatement> {
    return this.tenantDb.run((tx) => this.statementOf(tx, employeeId));
  }

  /** The signed-in employee's own statement, or null when they are not a member. */
  mine(user: AuthUser): Promise<PfStatement | null> {
    return this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) return null;
      const [member] = await tx.select().from(pfMembers).where(eq(pfMembers.employeeId, me.id));
      return member ? this.statementOf(tx, me.id) : null;
    });
  }

  /** Makes people members from a date; those already members are left as they are. */
  async join(actor: AuthUser, input: PfJoinInput): Promise<{ joined: number }> {
    return this.tenantDb.run(async (tx) => {
      const today = todayIn();
      const people = await tx
        .select({ id: employees.id, joinedOn: employees.joinedOn, status: employees.status })
        .from(employees)
        .where(
          input.everyone
            ? sql`${employees.status} = 'active' and (
                select j.employment_type from job_assignments j
                where j.employee_id = ${employees.id} and j.effective_from <= ${today}
                order by j.effective_from desc limit 1) = 'permanent'`
            : inArray(employees.id, input.employeeIds ?? []),
        );
      // Everyone joins once they have the service the Act asks for; named people from the date.
      const months = input.everyone
        ? ruleOn(BD_RULES, 'pf.min_service_months', input.joinedOn).value
        : 0;
      const rows = people
        .filter((p) => p.status === 'active')
        .map((p) => {
          const eligible = addMonths(p.joinedOn, months);
          return {
            tenantId: currentTenantId(),
            employeeId: p.id,
            joinedOn: input.joinedOn < eligible ? eligible : input.joinedOn,
            createdBy: actor.id,
          };
        });
      let joined = 0;
      for (let i = 0; i < rows.length; i += 1000) {
        const inserted = await tx
          .insert(pfMembers)
          .values(rows.slice(i, i + 1000))
          .onConflictDoNothing()
          .returning({ id: pfMembers.employeeId });
        joined += inserted.length;
      }
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.pf.join',
        entityType: 'pf_member',
        entityId: null,
        after: { people: joined, joinedOn: input.joinedOn },
      });
      return { joined };
    });
  }

  /**
   * Ends a membership. The employer's contributions not yet vested by the years of service
   * are forfeited back to the fund; the rest is what the leaver is paid out (M4 settlement).
   */
  async leave(actor: AuthUser, employeeId: string, leftOn: string): Promise<PfStatement> {
    await this.tenantDb.run(async (tx) => {
      const [member] = await tx
        .select()
        .from(pfMembers)
        .where(eq(pfMembers.employeeId, employeeId))
        .for('update');
      if (!member) throw new NotFoundException('Not a provident fund member');
      if (member.leftOn) throw conflict('pf_left', `Left the fund on ${member.leftOn}`);
      if (leftOn < member.joinedOn) {
        throw badRequest('before_joining', `Joined the fund on ${member.joinedOn}`);
      }
      const { vestedPercent: percent } = await endMembership(
        tx,
        this.cipher,
        employeeId,
        leftOn,
        actor.id,
        { payOut: false },
      );
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.pf.leave',
        entityType: 'pf_member',
        entityId: employeeId,
        after: { leftOn, vestedPercent: percent },
      });
    });
    return this.statement(employeeId);
  }

  /** An opening balance brought from the old fund, or money paid out. */
  async addEntry(actor: AuthUser, employeeId: string, input: PfEntryInput): Promise<PfStatement> {
    const { seal } = sealed(this.cipher);
    await this.tenantDb.run(async (tx) => {
      const [member] = await tx
        .select()
        .from(pfMembers)
        .where(eq(pfMembers.employeeId, employeeId));
      if (!member) throw new NotFoundException('Not a provident fund member');
      const signed =
        input.kind === 'withdrawal' ? new Decimal(input.amount).negated() : input.amount;
      if (input.kind === 'withdrawal') {
        const balance = (await pfBalances(tx, this.cipher, [employeeId])).get(employeeId);
        if (new Decimal(input.amount).greaterThan(balance?.[input.account] ?? 0)) {
          throw badRequest('more_than_balance', 'More than the account holds');
        }
      }
      await tx.insert(pfEntries).values({
        tenantId: currentTenantId(),
        employeeId,
        date: input.date,
        kind: input.kind,
        account: input.account,
        amountEnc: seal(CIPHER_FIELDS.pfEntries, money(signed)),
        note: input.note ?? null,
        createdBy: actor.id,
      });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: `payroll.pf.${input.kind}`,
        entityType: 'pf_member',
        entityId: employeeId,
        after: { date: input.date, account: input.account },
      });
    });
    return this.statement(employeeId);
  }

  /**
   * The trustees' interest for the year: each member's balance on the date, per account,
   * times the rate. Once per date.
   */
  async postInterest(actor: AuthUser, input: PfInterestInput): Promise<{ members: number }> {
    const { seal } = sealed(this.cipher);
    return this.tenantDb.run(async (tx) => {
      const [already] = await tx
        .select({ id: pfEntries.id })
        .from(pfEntries)
        .where(and(eq(pfEntries.kind, 'interest'), eq(pfEntries.date, input.date)))
        .limit(1);
      if (already)
        throw conflict('interest_posted', `Interest is already posted for ${input.date}`);
      const members = await tx
        .select({ employeeId: pfMembers.employeeId })
        .from(pfMembers)
        .where(and(lte(pfMembers.joinedOn, input.date), isNull(pfMembers.leftOn)));
      const balances = await pfBalances(
        tx,
        this.cipher,
        members.map((m) => m.employeeId),
        input.date,
      );
      const rows: (typeof pfEntries.$inferInsert)[] = [];
      for (const [employeeId, b] of balances) {
        for (const account of ['own', 'employer'] as const) {
          const interest = b[account]
            .times(input.percent)
            .dividedBy(100)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
          if (interest.lessThanOrEqualTo(0)) continue;
          rows.push({
            tenantId: currentTenantId(),
            employeeId,
            date: input.date,
            kind: 'interest',
            account,
            amountEnc: seal(CIPHER_FIELDS.pfEntries, money(interest)),
            note: input.note ?? `${input.percent}% for the year`,
            createdBy: actor.id,
          });
        }
      }
      for (let i = 0; i < rows.length; i += 1000) {
        await tx.insert(pfEntries).values(rows.slice(i, i + 1000));
      }
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.pf.interest',
        entityType: 'pf_member',
        entityId: null,
        after: { date: input.date, percent: input.percent, members: balances.size },
      });
      return { members: balances.size };
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async statementOf(tx: Tx, employeeId: string): Promise<PfStatement> {
    const rows = await tx
      .select({ member: pfMembers, employee: employees })
      .from(pfMembers)
      .innerJoin(employees, eq(employees.id, pfMembers.employeeId))
      .where(eq(pfMembers.employeeId, employeeId));
    if (rows.length === 0) throw new NotFoundException('Not a provident fund member');
    const [view] = await this.memberViews(tx, rows);
    const { open } = sealed(this.cipher);
    const entries = await tx
      .select()
      .from(pfEntries)
      .where(eq(pfEntries.employeeId, employeeId))
      .orderBy(asc(pfEntries.date), asc(pfEntries.createdAt));
    return {
      ...view!,
      entries: entries.map((e) => ({
        id: e.id,
        date: e.date,
        kind: e.kind,
        account: e.account,
        amount: money(open<string>(CIPHER_FIELDS.pfEntries, e.amountEnc)),
        runId: e.runId,
        note: e.note,
      })),
    };
  }

  private async memberViews(
    tx: Tx,
    rows: { member: typeof pfMembers.$inferSelect; employee: typeof employees.$inferSelect }[],
  ): Promise<PfMemberView[]> {
    const settings = await payrollSettingsOf(tx);
    const balances = await pfBalances(
      tx,
      this.cipher,
      rows.map((r) => r.employee.id),
    );
    const today = todayIn();
    return rows.map(({ member, employee }) => {
      const b = balances.get(employee.id) ?? { own: new Decimal(0), employer: new Decimal(0) };
      const percent = vestedPercent(
        settings.pfVesting,
        ageOn(employee.joinedOn, member.leftOn ?? today),
      );
      const balance: PfBalance = {
        own: money(b.own),
        employer: money(b.employer),
        total: money(b.own.plus(b.employer)),
        vestedPercent: percent,
        // A leaver's unvested share was already forfeited, so what is left is theirs.
        payable: money(
          member.leftOn
            ? b.own.plus(b.employer)
            : b.own.plus(
                b.employer.times(percent).dividedBy(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
              ),
        ),
      };
      return {
        employee: employeeRef(employee),
        joinedOn: member.joinedOn,
        leftOn: member.leftOn,
        balance,
      };
    });
  }
}
