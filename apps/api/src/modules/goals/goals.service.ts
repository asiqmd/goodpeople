import { BadRequestException, Injectable } from '@nestjs/common';
import {
  employees,
  goalCheckins,
  goals,
  jobAssignments,
  orgUnits,
  reviewCycles,
  tenantUsers,
  type Tx,
} from '@gp/db';
import {
  addDays,
  goalProblem,
  goalProgress,
  goalWeights,
  isRecordSource,
  todayIn,
  weightsComplete,
  type ApiError,
  type EmployeeRef,
  type GoalAgreeAllInput,
  type GoalCheckinInput,
  type GoalCheckinView,
  type GoalChoices,
  type GoalChoicesQuery,
  type GoalCompleteInput,
  type GoalDetail,
  type GoalDropInput,
  type GoalInput,
  type GoalListQuery,
  type GoalPeopleQuery,
  type GoalSubmitInput,
  type GoalSubmitResult,
  type GoalUpdateInput,
  type GoalView,
  type MyGoals,
  type Page,
  type TeamGoals,
  type TeamGoalsQuery,
  type UnitGoals,
} from '@gp/shared';
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScope, entityScopeOf } from '../access-scopes/entity-scope.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeesInUnits, inForceOn, unitAndBelow } from '../employees/employee.queries.js';
import {
  localDate,
  NotificationsService,
  usersWith,
  type Recipient,
} from '../notifications/notifications.service.js';
import {
  actionsOf,
  alignableGoals,
  cycleOpen,
  goalFor,
  jobOf,
  mustBeInOpenCycle,
  notFound,
  personAccess,
  unitAccess,
  viewerOf,
  type CycleRow,
  type GoalAccess,
  type GoalRow,
  type Viewer,
} from './access.js';
import { employeeRefs, goalViews, openCycles, toCycleRef, unitRefs } from './goal-views.js';
import { storeRecordKpis } from './kpi-records.js';

/** A 400 on one field of the goal form; the web translates the code. */
function fieldError(code: string, path: string, message: string) {
  const body: ApiError = {
    statusCode: 400,
    error: 'Bad Request',
    message,
    code,
    issues: [{ path, message }],
  };
  return new BadRequestException(body);
}

/** Whose goal: a person's, or a unit's, with the company it belongs to. */
interface Owner {
  employeeId: string | null;
  orgUnitId: string | null;
  legalEntityId: string | null;
}

type GoalValues = Pick<
  GoalRow,
  | 'title'
  | 'description'
  | 'kind'
  | 'keyResults'
  | 'measureUnit'
  | 'target'
  | 'direction'
  | 'source'
  | 'currentValue'
  | 'progress'
  | 'weight'
  | 'startsOn'
  | 'dueOn'
  | 'cycleId'
  | 'parentGoalId'
>;

const decimal = (n: number | null | undefined) =>
  n === null || n === undefined ? null : n.toFixed(2);
const asNumber = (v: string | null) => (v === null ? null : Number(v));

/** What was agreed: changing any of it sends a person's agreed goal back for agreement. */
const substance = (g: GoalValues) =>
  JSON.stringify([
    g.title,
    g.kind,
    g.keyResults.map((k) => k.text),
    g.measureUnit,
    asNumber(g.target),
    g.direction,
    g.source,
    asNumber(g.weight),
    g.cycleId,
  ]);

const given = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

const cycleWhere = (cycleId: string | undefined) =>
  cycleId === 'none' ? isNull(goals.cycleId) : cycleId ? eq(goals.cycleId, cycleId) : undefined;

const nameOf = (e: { fullName: string; fullNameBn: string | null }) => ({
  en: e.fullName,
  bn: e.fullNameBn ?? e.fullName,
});

/**
 * Goals and KPIs: drafted by the person or their manager, agreed by the manager, checked in
 * on through the period, and completed or dropped. Within a review cycle a person's agreed
 * goals carry weights that add up to 100%.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────────

  /** The login's own goals, what they may align them with, and the cycles open to them. */
  mine(user: AuthUser): Promise<MyGoals> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const me = viewer.employeeId;
      if (!me) {
        return {
          employee: null,
          manager: null,
          goals: [],
          alignTo: [],
          cycles: [],
          managesPeople: false,
          manage: viewer.manage,
        };
      }
      const job = await jobOf(tx, me);
      const people = await employeeRefs(tx, [me, ...(job?.managerId ? [job.managerId] : [])]);
      const rows = await tx
        .select()
        .from(goals)
        .where(eq(goals.employeeId, me))
        .orderBy(asc(goals.createdAt));
      const cycles = await openCycles(tx, job ? [job.legalEntityId] : []);
      return {
        employee: people.get(me) ?? null,
        manager: job?.managerId ? (people.get(job.managerId) ?? null) : null,
        goals: await goalViews(tx, rows),
        alignTo: await goalViews(tx, await alignableGoals(tx, { employeeId: me, orgUnitId: null })),
        cycles: cycles.map(toCycleRef),
        managesPeople: viewer.team.size > 0,
        manage: viewer.manage,
      };
    });
  }

  /** The goals of everyone below the login, by person; drafts are what waits for agreement. */
  team(user: AuthUser, query: TeamGoalsQuery): Promise<TeamGoals> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const ids = [...viewer.team];
      if (ids.length === 0) return { people: [], cycles: [], toAgree: 0 };
      const people = await employeeRefs(tx, ids);
      const jobs = await tx
        .select({ employeeId: jobAssignments.employeeId, managerId: jobAssignments.managerId })
        .from(jobAssignments)
        .where(and(inArray(jobAssignments.employeeId, ids), inForceOn(todayIn())));
      const managerOf = new Map(jobs.map((j) => [j.employeeId, j.managerId]));
      const managers = await employeeRefs(
        tx,
        jobs.flatMap((j) => j.managerId ?? []),
      );
      const rows = await tx
        .select()
        .from(goals)
        .where(
          and(
            inArray(goals.employeeId, ids),
            cycleWhere(query.cycleId),
            query.status ? eq(goals.status, query.status) : undefined,
          ),
        )
        .orderBy(asc(goals.createdAt));
      const views = await goalViews(tx, rows);
      const [waiting] = await tx
        .select({ n: count() })
        .from(goals)
        .leftJoin(reviewCycles, eq(reviewCycles.id, goals.cycleId))
        .where(
          and(
            inArray(goals.employeeId, ids),
            eq(goals.status, 'draft'),
            or(isNull(goals.cycleId), inArray(reviewCycles.status, ['draft', 'active'])),
          ),
        );
      const cycles = await tx
        .select()
        .from(reviewCycles)
        .where(
          or(
            inArray(reviewCycles.status, ['draft', 'active']),
            inArray(
              reviewCycles.id,
              tx
                .selectDistinct({ id: goals.cycleId })
                .from(goals)
                .where(and(inArray(goals.employeeId, ids), isNotNull(goals.cycleId))),
            ),
          ),
        )
        .orderBy(desc(reviewCycles.periodStart));
      return {
        people: [...people.values()]
          .toSorted((a, b) => a.fullName.localeCompare(b.fullName))
          .map((employee) => {
            const manager = managerOf.get(employee.id);
            return {
              employee,
              manager:
                manager && manager !== viewer.employeeId ? (managers.get(manager) ?? null) : null,
              goals: views.filter((g) => g.employee?.id === employee.id),
            };
          }),
        cycles: cycles.map(toCycleRef),
        toAgree: waiting?.n ?? 0,
      };
    });
  }

  /** Units' goals the login sees, and the units they may set goals for. */
  units(user: AuthUser): Promise<UnitGoals> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const all = await tx.select().from(orgUnits).orderBy(asc(orgUnits.code));
      const seen = all.filter((u) => unitAccess(viewer, u).sees);
      const rows = seen.length
        ? await tx
            .select()
            .from(goals)
            .where(
              inArray(
                goals.orgUnitId,
                seen.map((u) => u.id),
              ),
            )
            .orderBy(asc(goals.createdAt))
        : [];
      const views = await goalViews(tx, rows);
      const refs = await unitRefs(
        tx,
        seen.map((u) => u.id),
      );
      const companies = viewer.manage
        ? viewer.companies
        : viewer.legalEntityId
          ? [viewer.legalEntityId]
          : [];
      return {
        units: seen
          .map((u) => ({
            unit: refs.get(u.id)!,
            goals: views.filter((g) => g.orgUnit?.id === u.id),
            canWrite: unitAccess(viewer, u).writes && u.isActive,
          }))
          .filter((item) => item.goals.length > 0 || item.canWrite),
        cycles: (await openCycles(tx, companies)).map(toCycleRef),
      };
    });
  }

  /** Everyone's goals in the companies the login looks after, for `performance.manage`. */
  list(user: AuthUser, query: GoalListQuery): Promise<Page<GoalView>> {
    return this.tenantDb.run(async (tx) => {
      const units = query.orgUnitId ? await unitAndBelow(tx, query.orgUnitId) : null;
      const where = and(
        isNotNull(goals.employeeId),
        await entityScope(tx, user, goals.employeeId),
        cycleWhere(query.cycleId),
        query.status ? eq(goals.status, query.status) : undefined,
        query.employeeId ? eq(goals.employeeId, query.employeeId) : undefined,
        units ? inArray(goals.employeeId, employeesInUnits(tx, units, todayIn())) : undefined,
      );
      const [total] = await tx.select({ n: count() }).from(goals).where(where);
      const rows = await tx
        .select()
        .from(goals)
        .innerJoin(employees, eq(employees.id, goals.employeeId))
        .where(where)
        .orderBy(asc(employees.fullName), asc(goals.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      return {
        items: await goalViews(
          tx,
          rows.map((r) => r.goals),
        ),
        total: total?.n ?? 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  /** People the login may draft goals for: themselves, their team, and HR's whole companies. */
  people(user: AuthUser, query: GoalPeopleQuery): Promise<EmployeeRef[]> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const words = query.search?.replaceAll(/[%_\\]/g, '\\$&');
      const own = [...(viewer.employeeId ? [viewer.employeeId] : []), ...viewer.team];
      const whose = viewer.manage
        ? or(
            (await entityScope(tx, user, employees.id)) ?? sql`true`,
            own.length ? inArray(employees.id, own) : undefined,
          )
        : own.length
          ? inArray(employees.id, own)
          : undefined;
      if (!whose) return [];
      return tx
        .select({
          id: employees.id,
          employeeCode: employees.employeeCode,
          fullName: employees.fullName,
          fullNameBn: employees.fullNameBn,
        })
        .from(employees)
        .where(
          and(
            whose,
            eq(employees.status, 'active'),
            words
              ? or(
                  ilike(employees.fullName, `%${words}%`),
                  ilike(employees.fullNameBn, `%${words}%`),
                  ilike(employees.employeeCode, `%${words}%`),
                )
              : undefined,
          ),
        )
        .orderBy(asc(employees.fullName))
        .limit(30);
    });
  }

  /** The cycles and goals to align with that a new goal for this person or unit may use. */
  choices(user: AuthUser, query: GoalChoicesQuery): Promise<GoalChoices> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const owner = await this.ownerFor(tx, viewer, query);
      const people = await employeeRefs(tx, owner.employeeId ? [owner.employeeId] : []);
      const units = await unitRefs(tx, owner.orgUnitId ? [owner.orgUnitId] : []);
      const cycles = await openCycles(tx, owner.legalEntityId ? [owner.legalEntityId] : []);
      return {
        employee: owner.employeeId ? (people.get(owner.employeeId) ?? null) : null,
        orgUnit: owner.orgUnitId ? (units.get(owner.orgUnitId) ?? null) : null,
        cycles: cycles.map(toCycleRef),
        alignTo: await goalViews(tx, await alignableGoals(tx, owner)),
      };
    });
  }

  get(user: AuthUser, id: string): Promise<GoalDetail> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      return this.detail(tx, viewer, await goalFor(tx, viewer, id));
    });
  }

  // ── Changing ───────────────────────────────────────────────────────────────

  /** A person's goal starts as a draft to agree; a unit's is set by those who write it. */
  async create(user: AuthUser, input: GoalInput): Promise<GoalDetail> {
    const id = await this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const owner = await this.ownerFor(tx, viewer, input);
      const values = await this.values(tx, owner, null, input);
      const unit = !owner.employeeId;
      const [goal] = await tx
        .insert(goals)
        .values({
          tenantId: currentTenantId(),
          employeeId: owner.employeeId,
          orgUnitId: owner.orgUnitId,
          ...values,
          status: unit ? 'agreed' : 'draft',
          agreedAt: unit ? new Date() : null,
          agreedByUserId: unit ? user.id : null,
          createdByUserId: user.id,
        })
        .returning();
      await storeRecordKpis(tx, [goal!]);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'goal.create',
        entityType: 'goal',
        entityId: goal!.id,
        after: { employeeId: owner.employeeId, orgUnitId: owner.orgUnitId, ...values },
      });
      return goal!.id;
    });
    return this.get(user, id);
  }

  /** A change to an agreed goal's substance sends a person's goal back for agreement. */
  async update(user: AuthUser, id: string, input: GoalUpdateInput): Promise<GoalDetail> {
    await this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await goalFor(tx, viewer, id, { lock: true });
      const { goal } = access;
      if (!actionsOf(access).edit) this.cannotChange(access);
      const values = await this.values(tx, await this.ownerOf(tx, access), goal, input);
      const reopen =
        !!goal.employeeId && goal.status === 'agreed' && substance(goal) !== substance(values);
      await tx
        .update(goals)
        .set({
          ...values,
          ...(reopen ? { status: 'draft', agreedAt: null, agreedByUserId: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(goals.id, id));
      const [saved] = await tx.select().from(goals).where(eq(goals.id, id));
      await storeRecordKpis(tx, [saved!]);
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'goal.update',
        entityType: 'goal',
        entityId: id,
        before: { status: goal.status },
        after: { ...values, status: reopen ? 'draft' : goal.status },
      });
    });
    return this.get(user, id);
  }

  async agree(user: AuthUser, id: string): Promise<GoalDetail> {
    await this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await goalFor(tx, viewer, id, { lock: true });
      const { goal } = access;
      if (!actionsOf(access).agree) {
        if (access.own) throw this.ownGoals();
        if (goal.status !== 'draft') {
          throw conflict('goal_not_draft', `This goal is ${goal.status}, not a draft`);
        }
        this.cannotChange(access);
      }
      await this.agreeGoals(tx, user, goal.employeeId!, access.cycle, [goal]);
    });
    return this.get(user, id);
  }

  /** Every draft of one person for a cycle, agreed at once; their weights must add up. */
  agreeAll(user: AuthUser, input: GoalAgreeAllInput): Promise<GoalView[]> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await personAccess(tx, viewer, input.employeeId);
      if (!access) throw notFound('person');
      if (access.own) throw this.ownGoals();
      if (!access.leads) throw notFound('person');
      const cycle = await this.cycle(tx, input.cycleId);
      mustBeInOpenCycle(cycle);
      const drafts = await tx
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.employeeId, input.employeeId),
            input.cycleId ? eq(goals.cycleId, input.cycleId) : isNull(goals.cycleId),
            eq(goals.status, 'draft'),
          ),
        )
        .for('update');
      if (drafts.length === 0) throw this.noDrafts();
      await this.agreeGoals(tx, user, input.employeeId, cycle, drafts);
      const agreed = await tx
        .select()
        .from(goals)
        .where(
          inArray(
            goals.id,
            drafts.map((d) => d.id),
          ),
        )
        .orderBy(asc(goals.createdAt));
      return goalViews(tx, agreed);
    });
  }

  /** The login's drafts for a cycle, sent to their manager (or HR, without one) to agree. */
  submit(user: AuthUser, input: GoalSubmitInput): Promise<GoalSubmitResult> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      if (!viewer.employeeId) throw notFound('person');
      const cycle = await this.cycle(tx, input.cycleId);
      mustBeInOpenCycle(cycle);
      const drafts = await tx
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.employeeId, viewer.employeeId),
            input.cycleId ? eq(goals.cycleId, input.cycleId) : isNull(goals.cycleId),
            eq(goals.status, 'draft'),
          ),
        );
      if (drafts.length === 0) throw this.noDrafts();
      const [me] = await tx.select().from(employees).where(eq(employees.id, viewer.employeeId));
      const job = await jobOf(tx, me!.id);
      const recipients: Recipient[] = job?.managerId
        ? [{ employeeId: job.managerId }]
        : await this.hrFor(tx, job?.legalEntityId ?? null);
      const name = nameOf(me!);
      const n = drafts.length;
      const bnCount = new Intl.NumberFormat('bn-BD').format(n);
      const due = cycle?.goalsDueOn ?? addDays(todayIn(), 7);
      // Each version of the drafts is sent once: a second click tells nobody again.
      const version = Math.max(...drafts.map((d) => d.updatedAt.getTime()));
      const notified = await this.notifications.notify(tx, {
        event: 'performance.task',
        recipients,
        values: {
          'task.title': {
            en: `Goals to agree for ${name.en}`,
            bn: `${name.bn}-এর লক্ষ্যে সম্মতি দিন`,
          },
          'task.detail': {
            en: `${name.en} sent ${n} draft goal${n === 1 ? '' : 's'}${cycle ? ` for ${cycle.name}` : ''} for you to agree.`,
            bn: `${name.bn} ${cycle ? `${cycle.name}-এর জন্য ` : ''}${bnCount}টি খসড়া লক্ষ্য আপনার সম্মতির জন্য পাঠিয়েছেন।`,
          },
          'task.due': localDate(due),
        },
        link: `/workspace/performance/goals?tab=team${cycle ? `&cycle=${cycle.id}` : ''}`,
        dedupeKey: `goals-submit:${me!.id}:${cycle?.id ?? 'none'}:${version}`,
        data: { employeeId: me!.id, ...(cycle ? { cycleId: cycle.id } : {}) },
      });
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'goal.submit',
        entityType: 'employee',
        entityId: me!.id,
        after: { cycleId: cycle?.id ?? null, goals: drafts.map((d) => d.id) },
      });
      return { goals: n, notified };
    });
  }

  /**
   * A check-in moves a goal on: the key results done, the progress (an objective without key
   * results) or the value (a KPI typed by hand). A KPI from the records takes a note only.
   */
  async checkin(user: AuthUser, id: string, input: GoalCheckinInput): Promise<GoalDetail> {
    await this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await goalFor(tx, viewer, id, { lock: true });
      const { goal } = access;
      if (!actionsOf(access).checkin) this.cannotChange(access);
      // A check-in writes the goal anyway: what the records say today is stored with it.
      await storeRecordKpis(tx, [goal]);
      const note = input.note?.trim() || null;
      const next = { ...goal };
      let value: string | null = null;
      let moved = false;
      if (goal.kind === 'kpi' && isRecordSource(goal.source)) {
        if (given(input.value)) {
          throw fieldError(
            'goal_value_from_records',
            'value',
            'This KPI reads its value from the records; it cannot be typed',
          );
        }
      } else if (goal.kind === 'kpi') {
        if (given(input.value)) {
          value = decimal(input.value);
          next.currentValue = value;
          moved = true;
        }
      } else if (goal.keyResults.length > 0) {
        if (input.done) {
          next.keyResults = goal.keyResults.map((k, i) => ({
            ...k,
            done: input.done!.includes(i),
          }));
          moved = true;
        }
      } else if (given(input.progress)) {
        next.progress = input.progress;
        moved = true;
      }
      if (!moved && !note) {
        throw badRequest('goal_checkin_empty', 'Give the progress, a value or a note');
      }
      next.progress = goalProgress(next);
      // A KPI from the records moves with the records, not with check-ins.
      const progress = goal.kind === 'kpi' && isRecordSource(goal.source) ? null : next.progress;
      await tx.insert(goalCheckins).values({
        tenantId: currentTenantId(),
        goalId: id,
        progress,
        value,
        note,
        authorUserId: user.id,
      });
      await tx
        .update(goals)
        .set({
          keyResults: next.keyResults,
          currentValue: next.currentValue,
          progress: next.progress,
          updatedAt: new Date(),
        })
        .where(eq(goals.id, id));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'goal.checkin',
        entityType: 'goal',
        entityId: id,
        before: { progress: goal.progress, currentValue: goal.currentValue },
        after: { progress: next.progress, currentValue: next.currentValue },
      });
    });
    return this.get(user, id);
  }

  async complete(user: AuthUser, id: string, input: GoalCompleteInput): Promise<GoalDetail> {
    await this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await goalFor(tx, viewer, id, { lock: true });
      const { goal } = access;
      if (!actionsOf(access).complete) {
        if (goal.status !== 'agreed') {
          throw conflict('goal_not_agreed', `This goal is ${goal.status}, not agreed`);
        }
        if (access.own) throw this.ownGoals();
        this.cannotChange(access);
      }
      // A completed goal keeps the value the records gave it on the day.
      await storeRecordKpis(tx, [goal]);
      await this.close(tx, user, goal, 'completed', input.note?.trim() || null);
    });
    return this.get(user, id);
  }

  /** An abandoned goal is dropped with why; the note is kept as its last check-in. */
  async drop(user: AuthUser, id: string, input: GoalDropInput): Promise<GoalDetail> {
    await this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const access = await goalFor(tx, viewer, id, { lock: true });
      if (!actionsOf(access).drop) {
        if (access.own && access.goal.status === 'agreed') throw this.ownGoals();
        this.cannotChange(access);
      }
      await this.close(tx, user, access.goal, 'dropped', input.note.trim());
    });
    return this.get(user, id);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async detail(tx: Tx, viewer: Viewer, access: GoalAccess): Promise<GoalDetail> {
    const { goal } = access;
    const [view] = await goalViews(tx, [goal]);
    const can = actionsOf(access);
    const [parent] = goal.parentGoalId
      ? await tx.select().from(goals).where(eq(goals.id, goal.parentGoalId))
      : [];
    const parentVisible = parent ? await this.visible(tx, viewer, [parent]) : [];
    const children = await this.visible(
      tx,
      viewer,
      await tx
        .select()
        .from(goals)
        .where(eq(goals.parentGoalId, goal.id))
        .orderBy(asc(goals.createdAt)),
    );
    const checkins = await tx
      .select({ c: goalCheckins, author: tenantUsers.name })
      .from(goalCheckins)
      .leftJoin(tenantUsers, eq(tenantUsers.id, goalCheckins.authorUserId))
      .where(eq(goalCheckins.goalId, goal.id))
      .orderBy(desc(goalCheckins.createdAt));
    const owner = await this.ownerOf(tx, access);
    const alignTo = can.edit
      ? (await alignableGoals(tx, owner)).filter((g) => g.id !== goal.id)
      : [];
    const cycles = can.edit
      ? await openCycles(tx, owner.legalEntityId ? [owner.legalEntityId] : [])
      : [];
    return {
      ...view!,
      parentGoal: (await goalViews(tx, parentVisible))[0] ?? null,
      children: await goalViews(tx, children),
      checkins: checkins.map(({ c, author }): GoalCheckinView => ({
        id: c.id,
        progress: c.progress,
        value: c.value,
        note: c.note,
        author,
        createdAt: c.createdAt.toISOString(),
      })),
      dropNote: goal.status === 'dropped' ? (checkins[0]?.c.note ?? null) : null,
      can,
      alignTo: await goalViews(tx, alignTo),
      cycles: cycles.map(toCycleRef),
    };
  }

  /** The goals among these the viewer may open. */
  private async visible(tx: Tx, viewer: Viewer, rows: GoalRow[]): Promise<GoalRow[]> {
    const unitIds = [...new Set(rows.flatMap((g) => g.orgUnitId ?? []))];
    const units = new Map(
      (unitIds.length
        ? await tx.select().from(orgUnits).where(inArray(orgUnits.id, unitIds))
        : []
      ).map((u) => [u.id, u]),
    );
    const out: GoalRow[] = [];
    for (const g of rows) {
      const unit = g.orgUnitId ? units.get(g.orgUnitId) : undefined;
      const sees = g.employeeId
        ? !!(await personAccess(tx, viewer, g.employeeId))
        : !!unit && unitAccess(viewer, unit).sees;
      if (sees) out.push(g);
    }
    return out;
  }

  private async ownerOf(tx: Tx, access: GoalAccess): Promise<Owner> {
    const { goal, unit } = access;
    const company = goal.employeeId
      ? ((await jobOf(tx, goal.employeeId))?.legalEntityId ?? null)
      : (unit?.legalEntityId ?? null);
    return { employeeId: goal.employeeId, orgUnitId: goal.orgUnitId, legalEntityId: company };
  }

  /** Whose new goal this is, refusing people and units the login has nothing to do with. */
  private async ownerFor(
    tx: Tx,
    viewer: Viewer,
    input: Pick<GoalInput, 'employeeId' | 'orgUnitId'>,
  ): Promise<Owner> {
    if (input.orgUnitId) {
      if (input.employeeId) {
        throw fieldError(
          'goal_owner_one',
          'orgUnitId',
          'A goal is a person’s or a unit’s, not both',
        );
      }
      const [unit] = await tx.select().from(orgUnits).where(eq(orgUnits.id, input.orgUnitId));
      const access = unit ? unitAccess(viewer, unit) : null;
      if (!unit || !access?.sees) throw notFound('unit');
      if (!access.writes) {
        throw forbidden(
          'goal_unit_not_yours',
          'A unit’s goals are set by HR or by a manager with people in the unit',
        );
      }
      return { employeeId: null, orgUnitId: unit.id, legalEntityId: unit.legalEntityId };
    }
    const employeeId = input.employeeId ?? viewer.employeeId;
    if (!employeeId) {
      throw fieldError('goal_owner_required', 'employeeId', 'Choose whose goal this is');
    }
    const [person] = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, employeeId));
    if (!person || !(await personAccess(tx, viewer, employeeId))) throw notFound('person');
    const job = await jobOf(tx, employeeId);
    return { employeeId, orgUnitId: null, legalEntityId: job?.legalEntityId ?? null };
  }

  private async cycle(tx: Tx, cycleId: string | null | undefined): Promise<CycleRow | null> {
    if (!cycleId) return null;
    const [cycle] = await tx.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId));
    if (!cycle) throw notFound('review cycle');
    return cycle;
  }

  /**
   * The goal's columns from what was given over what it has: only the fields of its kind, a
   * KPI from the records in percent with higher better, dates from its cycle where none are
   * given, and a parent it may serve. Refuses fields that do not hold together.
   */
  private async values(
    tx: Tx,
    owner: Owner,
    existing: GoalRow | null,
    input: GoalUpdateInput,
  ): Promise<GoalValues> {
    const take = <K extends keyof GoalUpdateInput & keyof GoalRow>(key: K) =>
      input[key] !== undefined ? input[key] : (existing?.[key] ?? null);
    const kind = input.kind ?? existing?.kind ?? 'objective';
    const kpi = kind === 'kpi';
    const source = kpi ? (input.source ?? existing?.source ?? 'manual') : 'manual';
    const fromRecords = isRecordSource(source);

    const cycleId = take('cycleId') as string | null;
    const cycle = await this.cycle(tx, cycleId);
    if (cycle && cycleId !== existing?.cycleId) {
      const forCompany =
        cycle.legalEntityIds.length === 0 ||
        (!!owner.legalEntityId && cycle.legalEntityIds.includes(owner.legalEntityId));
      if (!cycleOpen(cycle) || !forCompany) {
        throw fieldError(
          'goal_cycle_not_open',
          'cycleId',
          'Choose a review cycle that is being set up or under way, for this company',
        );
      }
    }

    const parentGoalId = take('parentGoalId') as string | null;
    if (parentGoalId && parentGoalId !== existing?.parentGoalId) {
      const allowed = await alignableGoals(tx, owner);
      if (parentGoalId === existing?.id || !allowed.some((g) => g.id === parentGoalId)) {
        throw fieldError(
          'goal_parent_not_allowed',
          'parentGoalId',
          'A goal serves a goal of its unit or a unit above, or the manager’s own goal',
        );
      }
    }

    const earlier = new Map(existing?.keyResults.map((k) => [k.text, k.done]) ?? []);
    const keyResults =
      kind === 'objective'
        ? (input.keyResults?.map((k) => ({
            text: k.text,
            done: k.done ?? earlier.get(k.text) ?? false,
          })) ??
          existing?.keyResults ??
          [])
        : [];
    const target = kpi
      ? input.target !== undefined
        ? decimal(input.target)
        : (existing?.target ?? null)
      : null;
    const values: GoalValues = {
      title: (take('title') as string).trim(),
      description: (take('description') as string | null)?.trim() || null,
      kind,
      keyResults,
      measureUnit: kpi ? (fromRecords ? '%' : (take('measureUnit') as string | null)) : null,
      target,
      direction: kpi ? (fromRecords ? 'higher' : take('direction')) : null,
      source,
      currentValue: kpi ? (existing?.kind === 'kpi' ? existing.currentValue : null) : null,
      progress: existing?.progress ?? 0,
      // A unit's goals carry no weights: weights share out one person's goals.
      weight: owner.employeeId
        ? input.weight !== undefined
          ? decimal(input.weight)
          : (existing?.weight ?? null)
        : null,
      startsOn: (take('startsOn') as string | null) ?? cycle?.periodStart ?? null,
      dueOn: (take('dueOn') as string | null) ?? cycle?.periodEnd ?? null,
      cycleId,
      parentGoalId,
    };
    const problem = goalProblem({ ...owner, ...values });
    if (problem) throw fieldError(problem.code, problem.path, problem.message);
    values.progress = goalProgress(values);
    return values;
  }

  /**
   * Agrees drafts of one person. Within a cycle every agreed goal needs a weight, the agreed
   * weights never pass 100%, and agreeing the last draft needs them to make exactly 100%.
   */
  private async agreeGoals(
    tx: Tx,
    user: AuthUser,
    employeeId: string,
    cycle: CycleRow | null,
    agreeing: GoalRow[],
  ) {
    if (cycle) {
      const unweighted = agreeing.find((g) => g.weight === null);
      if (unweighted) {
        throw conflict(
          'goal_weight_required',
          `Give “${unweighted.title}” a weight before agreeing it`,
        );
      }
      const all = await tx
        .select()
        .from(goals)
        .where(and(eq(goals.employeeId, employeeId), eq(goals.cycleId, cycle.id)))
        .for('update');
      const ids = new Set(agreeing.map((g) => g.id));
      const after = all.map((g) => (ids.has(g.id) ? { ...g, status: 'agreed' as const } : g));
      const { agreed } = goalWeights(after);
      const draftsLeft = after.some((g) => g.status === 'draft');
      if (agreed > 100) {
        throw conflict(
          'goal_weights_over',
          `The agreed goals for ${cycle.name} would weigh ${agreed}%, more than 100%`,
        );
      }
      if (!draftsLeft && !weightsComplete(agreed)) {
        throw conflict(
          'goal_weights_total',
          `A person’s agreed goals for ${cycle.name} must weigh 100% together; these weigh ${agreed}%`,
        );
      }
    }
    await storeRecordKpis(tx, agreeing);
    const now = new Date();
    await tx
      .update(goals)
      .set({ status: 'agreed', agreedAt: now, agreedByUserId: user.id, updatedAt: now })
      .where(
        inArray(
          goals.id,
          agreeing.map((g) => g.id),
        ),
      );
    for (const g of agreeing) {
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'goal.agree',
        entityType: 'goal',
        entityId: g.id,
        before: { status: g.status },
        after: { status: 'agreed', weight: g.weight },
      });
    }
  }

  private async close(
    tx: Tx,
    user: AuthUser,
    goal: GoalRow,
    status: 'completed' | 'dropped',
    note: string | null,
  ) {
    if (note) {
      await tx.insert(goalCheckins).values({
        tenantId: currentTenantId(),
        goalId: goal.id,
        progress: goal.progress,
        note,
        authorUserId: user.id,
      });
    }
    await tx.update(goals).set({ status, updatedAt: new Date() }).where(eq(goals.id, goal.id));
    await this.audit.record(tx, {
      actorUserId: user.id,
      action: status === 'completed' ? 'goal.complete' : 'goal.drop',
      entityType: 'goal',
      entityId: goal.id,
      before: { status: goal.status },
      after: { status, note },
    });
  }

  /** Those with `performance.manage` who look after this company. */
  private async hrFor(tx: Tx, legalEntityId: string | null): Promise<Recipient[]> {
    const out: Recipient[] = [];
    for (const r of await usersWith(tx, 'performance.manage')) {
      const companies = await entityScopeOf(tx, r.userId!);
      if (!companies || (legalEntityId && companies.includes(legalEntityId))) out.push(r);
    }
    return out;
  }

  /** Why the viewer, who may see the goal, may not do this to it. */
  private cannotChange(access: GoalAccess): never {
    const { goal } = access;
    if (goal.status === 'completed' || goal.status === 'dropped') {
      throw conflict('goal_closed', `This goal is ${goal.status} and no longer changes`);
    }
    mustBeInOpenCycle(access.cycle);
    if (!goal.employeeId) {
      throw forbidden(
        'goal_unit_not_yours',
        'A unit’s goals are set by HR or by a manager with people in the unit',
      );
    }
    throw forbidden('goal_not_yours', 'This is for the person’s manager or HR to do');
  }

  private ownGoals() {
    return forbidden(
      'agree_own_goals',
      'Your own goals are agreed, completed and dropped by your manager',
    );
  }

  private noDrafts() {
    return conflict('no_draft_goals', 'There are no draft goals to agree');
  }
}
