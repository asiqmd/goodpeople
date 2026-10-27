import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CIPHER_FIELDS,
  employees,
  jobAssignments,
  legalEntities,
  payGroups,
  payrollRunItems,
  payrollRuns,
  tradeUnions,
  unionMemberships,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  addDays,
  Decimal,
  groupBy,
  money,
  monthBounds,
  todayIn,
  type CheckOffReport,
  type CheckOffRow,
  type CheckOffUnionTotal,
  type TradeUnionInput,
  type TradeUnionSummaryView,
  type TradeUnionUpdate,
  type TradeUnionView,
  type UnionBulkResult,
  type UnionListView,
  type UnionMemberEnd,
  type UnionMemberInput,
  type UnionMembersBulkInput,
  type UnionMemberUpdate,
  type UnionSkipReason,
} from '@gp/shared';
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { mustUseCompany } from '../access-scopes/employee-scope.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { inForceOn } from '../employees/employee.queries.js';
import { csv } from '../payroll/disbursement.js';
import { sealed, type StoredResult } from '../payroll/run-context.js';
import { depositRuleOn, ruleRef, unionLimitOn, unionMembersNeeded } from './committee-rules.js';
import { employeeByRef } from './committees.service.js';
import { headcountOf, headcounts } from './relations-snapshot.js';

type UnionRow = typeof tradeUnions.$inferSelect;
type MembershipRow = typeof unionMemberships.$inferSelect;

const isMember = (m: MembershipRow, on: string) =>
  m.joinedOn <= on && (m.leftOn === null || m.leftOn >= on);
const consents = (m: MembershipRow, on: string) =>
  m.checkOffConsentOn !== null && m.checkOffConsentOn <= on;

/**
 * Trade unions in each company, their members and the subscriptions deducted from consenting
 * members' wages (check-off, s.204): what payroll deducted in a month and when it is due to
 * the union.
 */
/**
 * A login limited to some companies sees only their unions, with their members and check-off
 * (Phase 3 M4 access scopes); another company's union is not found.
 */
async function unionScope(tx: Tx, user: AuthUser): Promise<SQL | undefined> {
  if (user.kind !== 'tenant') return undefined;
  const entities = await entityScopeOf(tx, user.id);
  return entities ? inArray(tradeUnions.legalEntityId, entities) : undefined;
}

@Injectable()
export class UnionsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  list(user: AuthUser): Promise<UnionListView> {
    const today = todayIn();
    return this.tenantDb.run(async (tx) => {
      const unions = await this.summaries(tx, today, await unionScope(tx, user));
      const limit = unionLimitOn(today);
      const byEntity = groupBy(unions, (u) => u.legalEntity.id);
      return {
        unions,
        // At most three registered unions in an establishment (s.179).
        counts: [...byEntity.values()].map((group) => ({
          legalEntity: group[0]!.legalEntity,
          unions: group.length,
          max: limit.value,
          over: limit.value !== null && group.length > limit.value,
          rule: ruleRef(limit),
        })),
      };
    });
  }

  get(user: AuthUser, id: string): Promise<TradeUnionView> {
    return this.tenantDb.run(async (tx) => {
      await this.unionOrThrow(tx, user, id);
      return this.viewIn(tx, id);
    });
  }

  create(actor: AuthUser, input: TradeUnionInput): Promise<TradeUnionView> {
    return this.tenantDb.run(async (tx) => {
      await mustUseCompany(tx, actor, input.legalEntityId);
      if (input.isCba) await this.onlyCba(tx, input.legalEntityId, null);
      const [row] = await tx
        .insert(tradeUnions)
        .values({
          tenantId: currentTenantId(),
          legalEntityId: input.legalEntityId,
          name: input.name,
          registrationNo: input.registrationNo ?? null,
          registeredOn: input.registeredOn ?? null,
          federation: input.federation ?? null,
          isCba: input.isCba,
          checkOff: input.checkOff,
          monthlySubscription: input.monthlySubscription ?? null,
          note: input.note ?? null,
        })
        .returning();
      await this.record(tx, actor, 'relations.union.create', row!.id, null, row);
      return this.viewIn(tx, row!.id);
    });
  }

  update(actor: AuthUser, id: string, input: TradeUnionUpdate): Promise<TradeUnionView> {
    return this.tenantDb.run(async (tx) => {
      const current = await this.unionOrThrow(tx, actor, id);
      const next = {
        name: input.name ?? current.name,
        registrationNo: pick(input.registrationNo, current.registrationNo),
        registeredOn: pick(input.registeredOn, current.registeredOn),
        federation: pick(input.federation, current.federation),
        isCba: input.isCba ?? current.isCba,
        checkOff: input.checkOff ?? current.checkOff,
        monthlySubscription: pick(input.monthlySubscription, current.monthlySubscription),
        note: pick(input.note, current.note),
      };
      if (next.checkOff && !(Number(next.monthlySubscription ?? 0) > 0)) {
        throw badRequest('subscription_required', 'Check-off needs the monthly subscription');
      }
      if (next.isCba && !current.isCba) await this.onlyCba(tx, current.legalEntityId, id);
      await tx
        .update(tradeUnions)
        .set({ ...next, updatedAt: new Date() })
        .where(eq(tradeUnions.id, id));
      await this.record(tx, actor, 'relations.union.update', id, current, next);
      return this.viewIn(tx, id);
    });
  }

  /** Only a union with no members: memberships and check-off consents are records to keep. */
  remove(actor: AuthUser, id: string): Promise<void> {
    return this.tenantDb.run(async (tx) => {
      const current = await this.unionOrThrow(tx, actor, id);
      const [member] = await tx
        .select({ id: unionMemberships.id })
        .from(unionMemberships)
        .where(eq(unionMemberships.unionId, id))
        .limit(1);
      if (member) throw conflict('union_has_members', 'A union with members cannot be deleted');
      await tx.delete(tradeUnions).where(eq(tradeUnions.id, id));
      await this.record(tx, actor, 'relations.union.delete', id, current, null);
    });
  }

  addMember(actor: AuthUser, id: string, input: UnionMemberInput): Promise<TradeUnionView> {
    return this.tenantDb.run(async (tx) => {
      const union = await this.unionOrThrow(tx, actor, id);
      const employee = await employeeByRef(tx, input);
      const reason = (await this.reasonsNotToAdd(tx, union, [employee.id], input.joinedOn)).get(
        employee.id,
      );
      if (reason === 'other_company') {
        throw badRequest('member_other_company', 'The employee works for another company');
      }
      if (reason === 'other_union') {
        // A worker is a member of one trade union at a time (s.193).
        throw conflict('member_of_another_union', 'Already a member of another union');
      }
      if (reason === 'already_member') {
        throw conflict('already_member', 'Already a member of this union');
      }
      const [row] = await tx
        .insert(unionMemberships)
        .values({
          tenantId: currentTenantId(),
          unionId: id,
          employeeId: employee.id,
          role: input.role,
          joinedOn: input.joinedOn,
          checkOffConsentOn: input.checkOffConsentOn ?? null,
        })
        .returning();
      await this.record(tx, actor, 'relations.union.member_add', id, null, row);
      return this.viewIn(tx, id);
    });
  }

  /** Members from a list of employee codes; codes that cannot join are reported, not added. */
  addMembers(actor: AuthUser, id: string, input: UnionMembersBulkInput): Promise<UnionBulkResult> {
    return this.tenantDb.run(async (tx) => {
      const union = await this.unionOrThrow(tx, actor, id);
      const codes = [...new Set(input.employeeCodes.map((c) => c.trim()).filter(Boolean))];
      const found = await tx
        .select({ id: employees.id, code: employees.employeeCode })
        .from(employees)
        .where(
          inArray(
            sql`lower(${employees.employeeCode})`,
            codes.map((c) => c.toLowerCase()),
          ),
        );
      const byCode = new Map(found.map((e) => [e.code.toLowerCase(), e.id]));
      const reasons = await this.reasonsNotToAdd(
        tx,
        union,
        found.map((e) => e.id),
        input.joinedOn,
      );
      const skipped: UnionBulkResult['skipped'] = [];
      const adding: string[] = [];
      for (const code of codes) {
        const employeeId = byCode.get(code.toLowerCase());
        const reason: UnionSkipReason | undefined = employeeId
          ? reasons.get(employeeId)
          : 'not_found';
        if (reason) skipped.push({ code, reason });
        else if (!adding.includes(employeeId!)) adding.push(employeeId!);
      }
      if (adding.length) {
        await tx.insert(unionMemberships).values(
          adding.map((employeeId) => ({
            tenantId: currentTenantId(),
            unionId: id,
            employeeId,
            joinedOn: input.joinedOn,
            checkOffConsentOn: input.checkOffConsentOn ?? null,
          })),
        );
      }
      await this.record(tx, actor, 'relations.union.members_add', id, null, {
        added: adding.length,
        joinedOn: input.joinedOn,
        checkOffConsentOn: input.checkOffConsentOn ?? null,
      });
      return { added: adding.length, skipped };
    });
  }

  updateMember(
    actor: AuthUser,
    id: string,
    memberId: string,
    input: UnionMemberUpdate,
  ): Promise<TradeUnionView> {
    return this.tenantDb.run(async (tx) => {
      await this.unionOrThrow(tx, actor, id);
      const current = await this.membershipOrThrow(tx, id, memberId);
      const next = {
        role: input.role ?? current.role,
        checkOffConsentOn: pick(input.checkOffConsentOn, current.checkOffConsentOn),
      };
      await tx.update(unionMemberships).set(next).where(eq(unionMemberships.id, memberId));
      await this.record(tx, actor, 'relations.union.member_update', id, current, next);
      return this.viewIn(tx, id);
    });
  }

  endMember(
    actor: AuthUser,
    id: string,
    memberId: string,
    input: UnionMemberEnd,
  ): Promise<TradeUnionView> {
    return this.tenantDb.run(async (tx) => {
      await this.unionOrThrow(tx, actor, id);
      const current = await this.membershipOrThrow(tx, id, memberId);
      if (input.leftOn < current.joinedOn) {
        throw badRequest('ends_before_start', 'Cannot leave before joining');
      }
      await tx
        .update(unionMemberships)
        .set({ leftOn: input.leftOn })
        .where(eq(unionMemberships.id, memberId));
      await this.record(tx, actor, 'relations.union.member_end', id, current, input);
      return this.viewIn(tx, id);
    });
  }

  /**
   * A month's check-off: each consenting member of a check-off union (as payroll counts them:
   * joined and consented by the month's end, not left before it), the subscription, what the
   * month's locked regular run deducted as UNION_SUB, and when it is due to the union (s.204).
   */
  checkOff(user: AuthUser, month: string, unionId?: string): Promise<CheckOffReport> {
    const { start, end } = monthBounds(month);
    return this.tenantDb.run(async (tx) => {
      const unions = await tx
        .select()
        .from(tradeUnions)
        .where(
          and(
            eq(tradeUnions.checkOff, true),
            unionId ? eq(tradeUnions.id, unionId) : undefined,
            await unionScope(tx, user),
          ),
        )
        .orderBy(asc(tradeUnions.name));
      const memberships = unions.length
        ? await tx
            .select({ m: unionMemberships, employee: employees })
            .from(unionMemberships)
            .innerJoin(employees, eq(employees.id, unionMemberships.employeeId))
            .where(
              and(
                inArray(
                  unionMemberships.unionId,
                  unions.map((u) => u.id),
                ),
                lte(unionMemberships.joinedOn, end),
                or(isNull(unionMemberships.leftOn), gte(unionMemberships.leftOn, end)),
              ),
            )
            .orderBy(asc(employees.employeeCode))
        : [];
      const runs = await tx
        .select({ run: payrollRuns, payGroup: payGroups.name })
        .from(payrollRuns)
        .innerJoin(payGroups, eq(payGroups.id, payrollRuns.payGroupId))
        .where(
          and(
            eq(payrollRuns.kind, 'regular'),
            ne(payrollRuns.status, 'cancelled'),
            gte(payrollRuns.periodStart, start),
            lte(payrollRuns.periodStart, end),
          ),
        );
      const locked = runs.filter((r) => r.run.status === 'locked');
      const paying = memberships.filter((r) => consents(r.m, end));
      const items =
        locked.length && paying.length
          ? await tx
              .select()
              .from(payrollRunItems)
              .where(
                and(
                  inArray(
                    payrollRunItems.runId,
                    locked.map((r) => r.run.id),
                  ),
                  inArray(
                    payrollRunItems.employeeId,
                    paying.map((r) => r.employee.id),
                  ),
                  eq(payrollRunItems.status, 'ok'),
                ),
              )
          : [];
      const { open } = sealed(this.cipher);
      const runOf = new Map(locked.map((r) => [r.run.id, r]));
      const deducted = new Map(
        items.map((item) => {
          const result = open<StoredResult>(CIPHER_FIELDS.runResults, item.resultEnc);
          const amount = result.lines
            .filter((l) => l.code === 'UNION_SUB')
            .reduce((sum, l) => sum.plus(l.amount), new Decimal(0));
          return [item.employeeId, { amount: money(amount), run: runOf.get(item.runId)! }];
        }),
      );

      const unionById = new Map(unions.map((u) => [u.id, u]));
      const rows: CheckOffRow[] = paying.map(({ m, employee }) => {
        const union = unionById.get(m.unionId)!;
        const paid = deducted.get(employee.id);
        const paymentDate = paid?.run.run.paymentDate ?? null;
        return {
          union: { id: union.id, name: union.name },
          employee: {
            id: employee.id,
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            fullNameBn: employee.fullNameBn,
          },
          checkOffConsentOn: m.checkOffConsentOn!,
          subscription: money(union.monthlySubscription ?? 0),
          deducted: paid?.amount ?? null,
          runId: paid?.run.run.id ?? null,
          payGroup: paid?.run.payGroup ?? null,
          paymentDate,
          depositDueOn: paymentDate ? addDays(paymentDate, depositRuleOn(paymentDate).value) : null,
        };
      });
      const totals: CheckOffUnionTotal[] = unions.map((u) => {
        const mine = rows.filter((r) => r.union.id === u.id);
        const sum = (pick: (r: CheckOffRow) => string | null) =>
          money(mine.reduce((s, r) => s.plus(pick(r) ?? 0), new Decimal(0)));
        const due = mine.flatMap((r) => r.depositDueOn ?? []).toSorted();
        return {
          union: { id: u.id, name: u.name, registrationNo: u.registrationNo },
          members: mine.length,
          expected: sum((r) => r.subscription),
          deducted: sum((r) => r.deducted),
          depositDueOn: due[0] ?? null,
          payDirectly: memberships.filter((r) => r.m.unionId === u.id && !consents(r.m, end))
            .length,
        };
      });
      return {
        month,
        rows,
        unions: totals,
        unlockedRuns: runs.length - locked.length,
        depositDays: depositRuleOn(end).value,
        rule: ruleRef(depositRuleOn(end)),
      };
    });
  }

  async checkOffCsv(
    user: AuthUser,
    month: string,
    unionId?: string,
  ): Promise<{ text: string; fileName: string }> {
    const report = await this.checkOff(user, month, unionId);
    const union = new Map(report.unions.map((u) => [u.union.id, u.union]));
    return {
      text: csv([
        [
          'Union',
          'Registration no',
          'Employee code',
          'Name',
          'Consent on',
          'Subscription',
          'Deducted',
          'Pay group',
          'Payment date',
          'Deposit due',
        ],
        ...report.rows.map((r) => [
          r.union.name,
          union.get(r.union.id)?.registrationNo ?? '',
          r.employee.employeeCode,
          r.employee.fullName,
          r.checkOffConsentOn,
          r.subscription,
          r.deducted ?? '',
          r.payGroup ?? '',
          r.paymentDate ?? '',
          r.depositDueOn ?? '',
        ]),
      ]),
      fileName: `check-off-${month}.csv`,
    };
  }

  /** Why each employee cannot join the union on a date, if they cannot. */
  private async reasonsNotToAdd(
    tx: Tx,
    union: UnionRow,
    employeeIds: string[],
    joinedOn: string,
  ): Promise<Map<string, UnionSkipReason>> {
    const out = new Map<string, UnionSkipReason>();
    if (employeeIds.length === 0) return out;
    const today = todayIn();
    const jobs = await tx
      .select({
        employeeId: jobAssignments.employeeId,
        legalEntityId: jobAssignments.legalEntityId,
      })
      .from(jobAssignments)
      .where(and(inArray(jobAssignments.employeeId, employeeIds), inForceOn(today)));
    const entity = new Map(jobs.map((j) => [j.employeeId, j.legalEntityId]));
    const open = await tx
      .select()
      .from(unionMemberships)
      .where(
        and(
          inArray(unionMemberships.employeeId, employeeIds),
          or(isNull(unionMemberships.leftOn), gte(unionMemberships.leftOn, joinedOn)),
        ),
      );
    for (const id of employeeIds) {
      const memberships = open.filter((m) => m.employeeId === id);
      if (entity.get(id) !== union.legalEntityId) out.set(id, 'other_company');
      else if (memberships.some((m) => m.unionId === union.id)) out.set(id, 'already_member');
      else if (memberships.length) out.set(id, 'other_union');
    }
    return out;
  }

  /** One collective bargaining agent per company (s.202). */
  private async onlyCba(tx: Tx, legalEntityId: string | null, exceptId: string | null) {
    const [other] = await tx
      .select({ id: tradeUnions.id })
      .from(tradeUnions)
      .where(
        and(
          legalEntityId
            ? eq(tradeUnions.legalEntityId, legalEntityId)
            : isNull(tradeUnions.legalEntityId),
          eq(tradeUnions.isCba, true),
          exceptId ? ne(tradeUnions.id, exceptId) : undefined,
        ),
      );
    if (other) throw conflict('cba_exists', 'This company already has a bargaining agent');
  }

  private async summaries(tx: Tx, today: string, where?: SQL): Promise<TradeUnionSummaryView[]> {
    const unions = await tx
      .select({ union: tradeUnions, entity: { id: legalEntities.id, name: legalEntities.name } })
      .from(tradeUnions)
      .innerJoin(legalEntities, eq(legalEntities.id, tradeUnions.legalEntityId))
      .where(where)
      .orderBy(asc(legalEntities.name), asc(tradeUnions.name));
    if (unions.length === 0) return [];
    const memberships = await tx
      .select()
      .from(unionMemberships)
      .where(
        inArray(
          unionMemberships.unionId,
          unions.map((u) => u.union.id),
        ),
      );
    const counts = await headcounts(tx, today);
    return unions.map(({ union, entity }) => {
      const current = memberships.filter((m) => m.unionId === union.id && isMember(m, today));
      const { workers } = headcountOf(counts, entity.id);
      const { required, rule } = unionMembersNeeded(workers, today);
      return {
        id: union.id,
        legalEntity: entity,
        name: union.name,
        registrationNo: union.registrationNo,
        registeredOn: union.registeredOn,
        federation: union.federation,
        isCba: union.isCba,
        checkOff: union.checkOff,
        monthlySubscription: union.monthlySubscription && money(union.monthlySubscription),
        note: union.note,
        members: current.length,
        consenting: current.filter((m) => consents(m, today)).length,
        threshold: {
          workers,
          required,
          members: current.length,
          ok: current.length >= required,
          rule: ruleRef(rule),
        },
      };
    });
  }

  private async viewIn(tx: Tx, id: string): Promise<TradeUnionView> {
    const today = todayIn();
    const [summary] = await this.summaries(tx, today, eq(tradeUnions.id, id));
    if (!summary) throw new NotFoundException('Trade union not found');
    const members = await tx
      .select({ m: unionMemberships, employee: employees })
      .from(unionMemberships)
      .innerJoin(employees, eq(employees.id, unionMemberships.employeeId))
      .where(eq(unionMemberships.unionId, id))
      .orderBy(asc(employees.employeeCode), asc(unionMemberships.joinedOn));
    return {
      ...summary,
      memberList: members.map(({ m, employee }) => ({
        id: m.id,
        employee: {
          id: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          fullNameBn: employee.fullNameBn,
        },
        role: m.role,
        joinedOn: m.joinedOn,
        leftOn: m.leftOn,
        checkOffConsentOn: m.checkOffConsentOn,
        current: isMember(m, today),
      })),
    };
  }

  private async unionOrThrow(tx: Tx, user: AuthUser, id: string) {
    const [row] = await tx
      .select()
      .from(tradeUnions)
      .where(and(eq(tradeUnions.id, id), await unionScope(tx, user)));
    if (!row) throw new NotFoundException('Trade union not found');
    return row;
  }

  private async membershipOrThrow(tx: Tx, unionId: string, memberId: string) {
    const [row] = await tx
      .select()
      .from(unionMemberships)
      .where(and(eq(unionMemberships.id, memberId), eq(unionMemberships.unionId, unionId)));
    if (!row) throw new NotFoundException('Union member not found');
    return row;
  }

  private record(
    tx: Tx,
    actor: AuthUser,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record(tx, {
      actorUserId: actor.id,
      action,
      entityType: 'trade_union',
      entityId,
      before,
      after,
    });
  }
}

/** A field left out of an update keeps its value; null clears it. */
const pick = <T>(given: T | undefined, current: T) => (given !== undefined ? given : current);
