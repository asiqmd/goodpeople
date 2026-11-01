import {
  goals,
  improvementPlans,
  jobAssignments,
  probationReviews,
  reviewCycles,
  reviews,
  separations,
  tenantAuditLog,
} from '@gp/db';
import {
  addDays,
  DEFAULT_COMPETENCIES,
  todayIn,
  type EmployeeDetail,
  type NotificationInbox,
  type OutcomeCycle,
  type OutcomesView,
  type PerformanceMe,
  type PerformanceRecord,
  type PlanListItem,
  type PlanView,
  type ProbationReviewListItem,
  type ProbationReviewView,
  type ReviewStatus,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { runInTenantContext } from '../src/common/request-context.js';
import { ProbationReviewJobs } from '../src/modules/development/probation-jobs.service.js';
import { recruitmentKit, type Company } from './applications-helpers.js';
import { api, bearer, bootApp, testEnv } from './test-env.js';

const ref = (rows: { id: string; code: string | null }[], code: string) =>
  rows.find((r) => r.code === code)!.id;
const ratingsFor = (view: ProbationReviewView, rating = 4) =>
  Object.fromEntries(view.competencies.map((c) => [c.key, rating]));
const probationLink = (id: string) => `/workspace/performance/probation/${id}`;

describe('improvement plans, probation reviews and the performance record', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof recruitmentKit>>;
  const today = todayIn();

  beforeAll(async () => {
    app = await bootApp();
    kit = await recruitmentKit(app);
  });
  afterAll(async () => {
    await kit.close();
    await app.close();
  });

  const as = (token = kit.admin) => bearer(token);
  let nid = 0;

  /** An employee with a login (unless `login` is false), reporting to `managerId`. */
  async function person(
    options: {
      company?: Company;
      managerId?: string;
      login?: boolean;
      probationEndsOn?: string;
      joinedOn?: string;
    } = {},
  ) {
    const company = options.company ?? 'MGT';
    const employeeCode = `DV-${kit.unique().toUpperCase()}`;
    const email = `${employeeCode.toLowerCase()}@example.test`;
    const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
    const employee = (
      await api(app)
        .post('/tenant/employees')
        .set(as())
        .send({
          employeeCode,
          fullName: `Dev Test ${employeeCode}`,
          fatherName: 'Abdul Karim',
          motherName: 'Hosne Ara',
          dateOfBirth: '1992-05-10',
          gender: 'female',
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: { nid: `${Date.now()}${nid++}`.slice(-10) },
          joinedOn: options.joinedOn ?? '2024-01-01',
          ...(options.probationEndsOn ? { probationEndsOn: options.probationEndsOn } : {}),
          job: {
            legalEntityId: kit.company(company),
            locationId: ref(kit.org.locations, company === 'MGT' ? 'GZP' : 'NRJ'),
            orgUnitId: ref(kit.org.orgUnits, company === 'MGT' ? 'MGT-L1' : 'MGF-PROD'),
            designationId: ref(kit.org.designations, 'SO'),
            gradeId: ref(kit.org.grades, 'W5'),
            employmentType: options.probationEndsOn ? 'probationer' : 'permanent',
            workerCategory: 'worker',
            ...(options.managerId ? { managerId: options.managerId } : {}),
          },
          ...(options.login === false
            ? {}
            : { portalAccess: { email, role: 'employee', password: testEnv().password } }),
        })
        .expect(201)
    ).body.employee as EmployeeDetail;
    const token =
      options.login === false
        ? ''
        : ((
            await api(app)
              .post('/auth/login')
              .send({ tenant: 'my-group', email, password: testEnv().password })
              .expect(200)
          ).body.accessToken as string);
    return { id: employee.id, employee, token };
  }

  /** A manager above a manager above a team member, and someone outside the line. */
  async function line(company: Company = 'MGT') {
    const top = await person({ company });
    const manager = await person({ company, managerId: top.id });
    const member = await person({ company, managerId: manager.id });
    const stranger = await person({ company });
    return { top, manager, member, stranger };
  }

  const draft = (employeeId: string, token = kit.admin, over: Record<string, unknown> = {}) =>
    api(app)
      .post('/tenant/performance/plans')
      .set(as(token))
      .send({
        employeeId,
        reason: 'Output on the line has been below target for three months',
        startsOn: today,
        endsOn: addDays(today, 30),
        objectives: [{ text: 'Reach the line target', measure: '95% of target on 4 weeks of 5' }],
        support: 'Daily coaching from the line chief',
        ...over,
      });
  const plan = async (id: string, token = kit.admin) =>
    (await api(app).get(`/tenant/performance/plans/${id}`).set(as(token)).expect(200))
      .body as PlanView;
  const step = (id: string, what: string, token: string, body: object = {}) =>
    api(app).post(`/tenant/performance/plans/${id}/${what}`).set(as(token)).send(body);
  const inbox = async (token: string) =>
    (await api(app).get('/tenant/notifications').set(as(token)).expect(200))
      .body as NotificationInbox;
  const askProbations = () =>
    runInTenantContext(kit.tenantId, () => app.get(ProbationReviewJobs).askTenant(new Date()));
  const probationOf = async (employeeId: string) =>
    kit.inTenant((tx) =>
      tx.select().from(probationReviews).where(eq(probationReviews.employeeId, employeeId)),
    );
  /** A review cycle and reviews written straight to the tables (cycles are built alongside). */
  async function cycle(status: 'active' | 'released' = 'released') {
    const [row] = await kit.inTenant((tx) =>
      tx
        .insert(reviewCycles)
        .values({
          tenantId: kit.tenantId,
          name: `Annual review ${kit.unique()}`,
          periodStart: '2026-01-01',
          periodEnd: '2026-06-30',
          competencies: [...DEFAULT_COMPETENCIES],
          status,
          releasedAt: status === 'released' ? new Date() : null,
        })
        .returning(),
    );
    return row!;
  }
  async function review(
    cycleId: string,
    employeeId: string,
    fields: {
      status?: ReviewStatus;
      finalRating?: number | null;
      increment?: boolean;
      promotionDesignationId?: string | null;
    } = {},
  ) {
    const status = fields.status ?? 'released';
    const out = status === 'released' || status === 'acknowledged';
    const [row] = await kit.inTenant((tx) =>
      tx
        .insert(reviews)
        .values({
          tenantId: kit.tenantId,
          cycleId,
          employeeId,
          status,
          goalScore: '3.50',
          proposedRating: 3,
          finalRating: fields.finalRating === undefined ? 4 : fields.finalRating,
          recommendations: {
            increment: fields.increment ?? true,
            promotionDesignationId: fields.promotionDesignationId ?? null,
            plan: false,
          },
          releasedAt: out ? new Date() : null,
        })
        .returning(),
    );
    return row!;
  }

  // ── Improvement plans ──────────────────────────────────────────────────────

  it('lets the manager draft a plan, hidden from the person until it starts, and the person acknowledges it', async () => {
    const { top, manager, member, stranger } = await line();
    await draft(member.id, stranger.token).expect(404);
    await draft(member.id, manager.token, { objectives: [] }).expect(400);
    const created = (await draft(member.id, manager.token).expect(201)).body as PlanView;
    expect(created).toMatchObject({
      status: 'draft',
      role: 'manage',
      employee: { id: member.id },
      manager: { id: manager.id },
      can: { start: true, edit: true, checkin: false },
    });

    // Not the person's to see while it is a draft; never a stranger's.
    await api(app).get(`/tenant/performance/plans/${created.id}`).set(as(member.token)).expect(404);
    await api(app)
      .get(`/tenant/performance/plans/${created.id}`)
      .set(as(stranger.token))
      .expect(404);
    const theirs = async () =>
      (await api(app).get('/tenant/performance/plans').set(as(member.token)).expect(200))
        .body as PlanListItem[];
    expect((await theirs()).map((p) => p.id)).not.toContain(created.id);
    const strangers = (
      await api(app).get('/tenant/performance/plans').set(as(stranger.token)).expect(200)
    ).body as PlanListItem[];
    expect(strangers.map((p) => p.id)).not.toContain(created.id);
    // The manager's manager sees it too.
    expect((await plan(created.id, top.token)).role).toBe('manage');
    await step(created.id, 'start', member.token).expect(404);

    const started = (await step(created.id, 'start', manager.token).expect(200)).body as PlanView;
    expect(started.status).toBe('active');
    expect((await inbox(member.token)).items).toContainEqual(
      expect.objectContaining({
        event: 'performance.task',
        title: 'An improvement plan for you',
        link: `/workspace/performance/plans/${created.id}`,
      }),
    );
    expect(await theirs()).toContainEqual(expect.objectContaining({ id: created.id, mine: true }));
    const mine = await plan(created.id, member.token);
    expect(mine).toMatchObject({
      role: 'person',
      can: { acknowledge: true, checkin: false, close: false },
    });
    const own = { heldOn: today, note: 'My own note' };
    expect((await step(created.id, 'checkins', member.token, own).expect(403)).body.code).toBe(
      'plan_manager_only',
    );

    const acknowledged = (
      await step(created.id, 'acknowledge', member.token, {
        comment: 'I do not agree: the machine was broken for two of those weeks.',
      }).expect(200)
    ).body as PlanView;
    expect(acknowledged.acknowledgedAt).not.toBeNull();
    expect(acknowledged.employeeComment).toMatch(/do not agree/);
    expect((await step(created.id, 'acknowledge', member.token, {}).expect(409)).body.code).toBe(
      'plan_acknowledged',
    );
    await step(created.id, 'acknowledge', manager.token, {}).expect(403);
  });

  it('holds check-ins and extends a plan, with one plan open per person', async () => {
    const { manager, member } = await line();
    const { id } = (await draft(member.id, manager.token).expect(201)).body as PlanView;
    expect((await draft(member.id, manager.token).expect(409)).body.code).toBe('plan_open');
    await step(id, 'checkins', manager.token, { heldOn: today, note: 'Week one' }).expect(409);
    await step(id, 'start', manager.token).expect(200);
    expect((await draft(member.id).expect(409)).body.code).toBe('plan_open');

    expect(
      (
        await step(id, 'checkins', manager.token, {
          heldOn: addDays(today, 1),
          note: 'Too early',
        }).expect(400)
      ).body.code,
    ).toBe('checkin_date');
    await step(id, 'checkins', manager.token, { heldOn: today, note: 'Week one: 88%' }).expect(201);
    await step(id, 'checkins', kit.admin, { heldOn: today, note: 'HR joined: 90%' }).expect(201);
    expect((await plan(id)).checkins.map((c) => c.note)).toEqual([
      'Week one: 88%',
      'HR joined: 90%',
    ]);

    expect(
      (
        await step(id, 'extend', manager.token, {
          endsOn: addDays(today, 30),
          reason: 'Same date',
        }).expect(400)
      ).body.code,
    ).toBe('plan_extend_earlier');
    const extended = (
      await step(id, 'extend', manager.token, {
        endsOn: addDays(today, 60),
        reason: 'Two weeks lost to the machine change',
      }).expect(200)
    ).body as PlanView;
    expect(extended).toMatchObject({ status: 'extended', endsOn: addDays(today, 60) });
    expect(extended.extensions).toEqual([
      expect.objectContaining({
        from: addDays(today, 30),
        to: addDays(today, 60),
        reason: 'Two weeks lost to the machine change',
      }),
    ]);
    const actions = await kit.inTenant((tx) =>
      tx
        .select({ action: tenantAuditLog.action })
        .from(tenantAuditLog)
        .where(
          and(eq(tenantAuditLog.entityType, 'improvement_plan'), eq(tenantAuditLog.entityId, id)),
        ),
    );
    expect(actions.map((a) => a.action).toSorted()).toEqual([
      'improvement_plan.checkin',
      'improvement_plan.checkin',
      'improvement_plan.create',
      'improvement_plan.extend',
      'improvement_plan.start',
    ]);
  });

  it('closes a plan with each outcome, and not met changes nothing in the job', async () => {
    const { manager, member } = await line();
    const jobsOf = () =>
      kit.inTenant((tx) =>
        tx.select().from(jobAssignments).where(eq(jobAssignments.employeeId, member.id)),
      );
    const jobsBefore = await jobsOf();
    for (const outcome of ['successful', 'cancelled', 'not_met'] as const) {
      const { id } = (await draft(member.id, manager.token).expect(201)).body as PlanView;
      await step(id, 'close', manager.token, { outcome, note: 'Early' }).expect(409);
      await step(id, 'start', manager.token).expect(200);
      await step(id, 'close', member.token, { outcome, note: 'Mine' }).expect(403);
      const closed = (
        await step(id, 'close', manager.token, { outcome, note: `Closed as ${outcome}` }).expect(
          200,
        )
      ).body as PlanView;
      expect(closed).toMatchObject({ status: outcome, outcomeNote: `Closed as ${outcome}` });
      expect(closed.decidedAt).not.toBeNull();
      expect(closed.can).toMatchObject({ checkin: false, extend: false, close: false });
      expect(
        (await step(id, 'close', manager.token, { outcome, note: 'Again' }).expect(409)).body.code,
      ).toBe('plan_not_running');
    }

    // A plan records; it never ends employment or changes the job (Labour Act ss.23–24, 26).
    expect(await jobsOf()).toEqual(jobsBefore);
    const left = await kit.inTenant((tx) =>
      tx.select().from(separations).where(eq(separations.employeeId, member.id)),
    );
    expect(left).toEqual([]);
    const now = (await api(app).get(`/tenant/employees/${member.id}`).set(as()).expect(200))
      .body as EmployeeDetail;
    expect(now.status).toBe('active');
    expect(now.currentJob?.employmentType).toBe('permanent');
  });

  it('lets HR run plans within their companies, link a review of the person and discard a draft', async () => {
    const solo = await person({ company: 'MGF' });
    const other = await person({ company: 'MGF' });
    const mgt = await kit.staff('hr_officer', ['MGT']);
    const mgf = await kit.staff('hr_officer', ['MGF']);
    await draft(solo.id, mgt.token).expect(404);

    const cycleRow = await cycle();
    const theirReview = await review(cycleRow.id, solo.id);
    const notTheirs = await review(cycleRow.id, other.id);
    expect(
      (await draft(solo.id, mgf.token, { reviewId: notTheirs.id }).expect(400)).body.code,
    ).toBe('plan_review_not_theirs');
    const created = (await draft(solo.id, mgf.token, { reviewId: theirReview.id }).expect(201))
      .body as PlanView;
    expect(created).toMatchObject({
      manager: null,
      review: { id: theirReview.id, cycleName: cycleRow.name },
    });
    await api(app).get(`/tenant/performance/plans/${created.id}`).set(as(mgt.token)).expect(404);

    const changed = (
      await api(app)
        .patch(`/tenant/performance/plans/${created.id}`)
        .set(as(mgf.token))
        .send({
          reason: 'Late to the line on most days this quarter',
          startsOn: today,
          endsOn: addDays(today, 90),
          objectives: [
            { text: 'On time every day', measure: 'No late marks for 8 weeks' },
            { text: 'Keep the quality', measure: 'No rejects traced to the station' },
          ],
          reviewId: null,
        })
        .expect(200)
    ).body as PlanView;
    expect(changed).toMatchObject({ endsOn: addDays(today, 90), review: null });
    expect(changed.objectives).toHaveLength(2);

    await api(app).delete(`/tenant/performance/plans/${created.id}`).set(as(mgf.token)).expect(204);
    await api(app).get(`/tenant/performance/plans/${created.id}`).set(as(mgf.token)).expect(404);
    const people = (
      await api(app).get('/tenant/performance/plans/people').set(as(mgf.token)).expect(200)
    ).body as { id: string }[];
    expect(people.map((p) => p.id)).toContain(solo.id);
  });

  // ── Probation reviews ──────────────────────────────────────────────────────

  it('asks the manager for a probation review three weeks ahead, once per end, and again after an extension', async () => {
    const manager = await person();
    const due = await person({
      managerId: manager.id,
      joinedOn: addDays(today, -80),
      probationEndsOn: addDays(today, 10),
    });
    const later = await person({
      managerId: manager.id,
      joinedOn: addDays(today, -60),
      probationEndsOn: addDays(today, 30),
    });
    const alone = await person({
      company: 'MGF',
      joinedOn: addDays(today, -80),
      probationEndsOn: addDays(today, 12),
    });
    const mgf = await kit.staff('hr_officer', ['MGF']);
    const mgt = await kit.staff('hr_officer', ['MGT']);

    await askProbations();
    await askProbations();
    const [first] = await probationOf(due.id);
    expect(await probationOf(due.id)).toHaveLength(1);
    expect(first).toMatchObject({
      managerEmployeeId: manager.id,
      probationEndsOn: addDays(today, 10),
      submittedAt: null,
      actedAt: null,
    });
    expect(await probationOf(later.id)).toEqual([]);
    const [noManager] = await probationOf(alone.id);
    expect(noManager?.managerEmployeeId).toBeNull();

    expect((await inbox(manager.token)).items).toContainEqual(
      expect.objectContaining({
        event: 'performance.task',
        title: `Probation review for ${due.employee.fullName}`,
        link: probationLink(first!.id),
      }),
    );
    // Without a manager, HR for that company is asked.
    expect((await inbox(mgf.token)).items.map((n) => n.link)).toContain(
      probationLink(noManager!.id),
    );
    expect((await inbox(mgt.token)).items.map((n) => n.link)).not.toContain(
      probationLink(noManager!.id),
    );

    const managers = (
      await api(app).get('/tenant/performance/probation').set(as(manager.token)).expect(200)
    ).body as ProbationReviewListItem[];
    expect(managers).toContainEqual(
      expect.objectContaining({
        id: first!.id,
        state: 'due',
        dueOn: addDays(today, 3),
        employee: expect.objectContaining({ id: due.id }),
      }),
    );
    // The person never sees it.
    await api(app).get(`/tenant/performance/probation/${first!.id}`).set(as(due.token)).expect(404);
    const theirs = (
      await api(app).get('/tenant/performance/probation').set(as(due.token)).expect(200)
    ).body as ProbationReviewListItem[];
    expect(theirs.map((r) => r.id)).not.toContain(first!.id);

    // HR extends the probation: that review is acted on, and the new end gets its own.
    await api(app)
      .post(`/tenant/employees/${due.id}/probation/extend`)
      .set(as())
      .send({ until: addDays(today, 18), reason: 'Work could not be judged in time' })
      .expect(201);
    await askProbations();
    const after = (await probationOf(due.id)).toSorted((a, b) =>
      a.probationEndsOn.localeCompare(b.probationEndsOn),
    );
    expect(after.map((r) => r.probationEndsOn)).toEqual([addDays(today, 10), addDays(today, 18)]);
    expect(after[0]!.actedAt).not.toBeNull();
    expect(after[1]!.actedAt).toBeNull();
  });

  it('takes the manager’s review, tells HR, and marks it acted on once HR confirms the person', async () => {
    const manager = await person();
    const probationer = await person({
      managerId: manager.id,
      joinedOn: addDays(today, -80),
      probationEndsOn: addDays(today, 9),
    });
    const hr = await kit.staff('hr_officer', ['MGT']);
    const elsewhere = await kit.staff('hr_officer', ['MGF']);
    await askProbations();
    const [row] = await probationOf(probationer.id);
    const url = `/tenant/performance/probation/${row!.id}`;
    const form = (await api(app).get(url).set(as(manager.token)).expect(200))
      .body as ProbationReviewView;
    expect(form).toMatchObject({ state: 'due', canSubmit: true, manage: false });
    // Due a week before the end, in the manager's tasks as on the form.
    const me = (await api(app).get('/tenant/performance/me').set(as(manager.token)).expect(200))
      .body as PerformanceMe;
    expect(me.items).toContainEqual(
      expect.objectContaining({ kind: 'probation_review', id: row!.id, dueOn: addDays(today, 2) }),
    );
    expect(form.competencies.length).toBeGreaterThan(0);
    await api(app).get(url).set(as(elsewhere.token)).expect(404);

    const submit = (body: object, token = manager.token) =>
      api(app).post(`${url}/submit`).set(as(token)).send(body);
    const missing = ratingsFor(form);
    delete missing[form.competencies[0]!.key];
    expect(
      (await submit({ ratings: missing, recommendation: 'confirm' }).expect(400)).body.code,
    ).toBe('probation_ratings');
    await submit({ ratings: ratingsFor(form), recommendation: 'extend' }).expect(400);
    await submit(
      { ratings: ratingsFor(form), recommendation: 'confirm' },
      probationer.token,
    ).expect(404);
    const submitted = (
      await submit({
        ratings: ratingsFor(form, 4),
        recommendation: 'confirm',
        comment: 'Reliable, and quick to learn the new style',
      }).expect(200)
    ).body as ProbationReviewView;
    expect(submitted).toMatchObject({
      state: 'submitted',
      recommendation: 'confirm',
      canSubmit: false,
    });
    expect(
      (await submit({ ratings: ratingsFor(form), recommendation: 'confirm' }).expect(409)).body
        .code,
    ).toBe('probation_review_submitted');

    // HR for the company is told; a recommendation changes nothing by itself.
    expect((await inbox(hr.token)).items).toContainEqual(
      expect.objectContaining({
        event: 'performance.task',
        title: `Probation review in for ${probationer.employee.fullName}`,
        link: `/workspace/performance/probation/${row!.id}`,
      }),
    );
    expect((await inbox(elsewhere.token)).items.map((n) => n.link)).not.toContain(
      `/workspace/performance/probation/${row!.id}`,
    );
    const still = (await api(app).get(`/tenant/employees/${probationer.id}`).set(as()).expect(200))
      .body as EmployeeDetail;
    expect(still.confirmedOn).toBeNull();
    const hrList = (
      await api(app).get('/tenant/performance/probation?state=submitted').set(as(hr.token))
    ).body as ProbationReviewListItem[];
    expect(hrList).toContainEqual(
      expect.objectContaining({ id: row!.id, recommendation: 'confirm' }),
    );
    expect((await api(app).get(url).set(as(hr.token)).expect(200)).body.manage).toBe(true);

    await api(app)
      .post(`/tenant/employees/${probationer.id}/job-changes`)
      .set(as())
      .send({
        event: 'confirmation',
        effectiveFrom: today,
        reason: 'Confirmed after the probation review',
        changes: {},
      })
      .expect(201);
    const acted = (await api(app).get(url).set(as(hr.token)).expect(200))
      .body as ProbationReviewView;
    expect(acted).toMatchObject({ state: 'acted', actedAt: null, canSubmit: false });
    expect(
      (await submit({ ratings: ratingsFor(form), recommendation: 'confirm' }, hr.token).expect(409))
        .body.code,
    ).toBe('probation_review_closed');

    await askProbations();
    const [stored] = await probationOf(probationer.id);
    expect(stored!.actedAt).not.toBeNull();
    expect((await api(app).get(url).set(as(hr.token)).expect(200)).body.actedAt).toBe(
      stored!.actedAt!.toISOString(),
    );
  });

  it('shows a probation acted on at once without writing; only the daily job stores it', async () => {
    const manager = await person();
    const probationer = await person({
      managerId: manager.id,
      joinedOn: addDays(today, -80),
      probationEndsOn: addDays(today, 8),
    });
    await askProbations();
    const [row] = await probationOf(probationer.id);
    const url = `/tenant/performance/probation/${row!.id}`;
    await api(app)
      .post(`/tenant/employees/${probationer.id}/probation/extend`)
      .set(as())
      .send({ until: addDays(today, 40), reason: 'Work could not be judged in time' })
      .expect(201);

    const before = await probationOf(probationer.id);
    expect(before).toEqual([expect.objectContaining({ id: row!.id, actedAt: null })]);
    const detail = (await api(app).get(url).set(as(manager.token)).expect(200))
      .body as ProbationReviewView;
    expect(detail).toMatchObject({
      state: 'acted',
      actedAt: null,
      canSubmit: false,
      currentProbationEndsOn: addDays(today, 40),
    });
    const listed = (
      await api(app).get('/tenant/performance/probation?state=acted').set(as()).expect(200)
    ).body as ProbationReviewListItem[];
    expect(listed.map((r) => r.id)).toContain(row!.id);
    const record = (
      await api(app).get(`/tenant/employees/${probationer.id}/performance`).set(as()).expect(200)
    ).body as PerformanceRecord;
    expect(record.probationReviews).toEqual([
      expect.objectContaining({ id: row!.id, state: 'acted' }),
    ]);
    // Every read left the row as it was.
    expect(await probationOf(probationer.id)).toEqual(before);

    await askProbations();
    const [stored] = await probationOf(probationer.id);
    expect(stored!.actedAt).not.toBeNull();
  });

  // ── The record ─────────────────────────────────────────────────────────────

  it('shows a person’s record in full to HR and their managers, in part to them, and to no one else', async () => {
    const { top, manager, member, stranger } = await line();
    const hr = await kit.staff('hr_officer', ['MGT']);
    const elsewhere = await kit.staff('hr_officer', ['MGF']);
    const done = await cycle('released');
    const running = await cycle('active');
    const released = await review(done.id, member.id, { finalRating: 4 });
    const underway = await review(running.id, member.id, { status: 'manager', finalRating: null });
    await kit.inTenant((tx) =>
      tx.insert(goals).values({
        tenantId: kit.tenantId,
        employeeId: member.id,
        cycleId: done.id,
        title: 'Reach 95% of the line target',
        kind: 'kpi',
        status: 'agreed',
        weight: '100',
        progress: 80,
      }),
    );
    const closed = (await draft(member.id, manager.token).expect(201)).body as PlanView;
    await step(closed.id, 'start', manager.token).expect(200);
    await step(closed.id, 'close', manager.token, {
      outcome: 'successful',
      note: 'Target reached',
    }).expect(200);
    const drafted = (await draft(member.id, manager.token).expect(201)).body as PlanView;
    await kit.inTenant((tx) =>
      tx.insert(probationReviews).values({
        tenantId: kit.tenantId,
        employeeId: member.id,
        managerEmployeeId: manager.id,
        probationEndsOn: '2024-03-31',
      }),
    );

    const url = `/tenant/employees/${member.id}/performance`;
    for (const token of [hr.token, manager.token, top.token, kit.admin]) {
      const full = (await api(app).get(url).set(as(token)).expect(200)).body as PerformanceRecord;
      expect(full.self).toBe(false);
      expect(full.reviews).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: released.id, finalRating: 4, status: 'released' }),
          expect.objectContaining({ id: underway.id, finalRating: null, status: 'manager' }),
        ]),
      );
      expect(full.plans.map((p) => p.id).toSorted()).toEqual([closed.id, drafted.id].toSorted());
      expect(full.probationReviews).toHaveLength(1);
      expect(full.goals).toEqual([
        {
          cycle: expect.objectContaining({ id: done.id }),
          goals: [expect.objectContaining({ title: 'Reach 95% of the line target', progress: 80 })],
        },
      ]);
    }

    const own = (await api(app).get(url).set(as(member.token)).expect(200))
      .body as PerformanceRecord;
    expect(own.self).toBe(true);
    expect(own.reviews.map((r) => r.id)).toEqual([released.id]);
    expect(own.plans.map((p) => p.id)).toEqual([closed.id]);
    expect(own.probationReviews).toEqual([]);
    expect(own.goals[0]!.goals).toHaveLength(1);

    await api(app).get(url).set(as(stranger.token)).expect(404);
    await api(app).get(url).set(as(elsewhere.token)).expect(404);
    // The person's manager is not the manager's: the record goes up the line, not down.
    await api(app)
      .get(`/tenant/employees/${top.id}/performance`)
      .set(as(manager.token))
      .expect(404);
  });

  // ── Outcomes ───────────────────────────────────────────────────────────────

  it('lists the outcomes of released reviews within the login’s companies, as JSON and CSV', async () => {
    const inMgt = await person({ company: 'MGT', login: false });
    const inMgf = await person({ company: 'MGF', login: false });
    const notYet = await person({ company: 'MGT', login: false });
    const c = await cycle('released');
    const promoted = await review(c.id, inMgt.id, {
      finalRating: 5,
      promotionDesignationId: ref(kit.org.designations, 'SSO'),
    });
    const kept = await review(c.id, inMgf.id, { finalRating: 3, increment: false });
    await review(c.id, notYet.id, { status: 'calibration', finalRating: 3 });
    const mgt = await kit.staff('hr_officer', ['MGT']);
    const outcomes = async (token: string) =>
      (
        await api(app)
          .get(`/tenant/performance/outcomes?cycleId=${c.id}`)
          .set(as(token))
          .expect(200)
      ).body as OutcomesView;

    const all = await outcomes(kit.admin);
    expect(all.cycle.id).toBe(c.id);
    expect(all.rows.map((r) => r.reviewId).toSorted()).toEqual([promoted.id, kept.id].toSorted());
    expect(all.rows.find((r) => r.reviewId === promoted.id)).toMatchObject({
      employee: { employeeCode: inMgt.employee.employeeCode },
      company: { id: kit.company('MGT') },
      orgUnit: { name: 'Line 1' },
      designation: { id: ref(kit.org.designations, 'SO') },
      grade: { id: ref(kit.org.grades, 'W5') },
      finalRating: 5,
      goalScore: '3.50',
      recommendations: {
        increment: true,
        plan: false,
        promotionDesignation: { id: ref(kit.org.designations, 'SSO') },
      },
      acknowledgedAt: null,
    });
    expect((await outcomes(mgt.token)).rows.map((r) => r.reviewId)).toEqual([promoted.id]);

    const file = await api(app)
      .get(`/tenant/performance/outcomes?cycleId=${c.id}&format=csv`)
      .set(as(mgt.token))
      .expect(200)
      .expect('content-type', /text\/csv/);
    expect(file.text.startsWith('\uFEFF')).toBe(true);
    const lines = file.text.slice(1).trimEnd().split('\n');
    expect(lines[0]).toMatch(/^employee_code,name,/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`${inMgt.employee.employeeCode},`);
    expect(lines[1]).toContain(',5,3.50,yes,');

    const cycles = (await api(app).get('/tenant/performance/outcomes/cycles').set(as()).expect(200))
      .body as OutcomeCycle[];
    expect(cycles).toContainEqual(expect.objectContaining({ id: c.id, released: 2 }));
    const staff = await person();
    expect(
      (
        await api(app)
          .get(`/tenant/performance/outcomes?cycleId=${c.id}`)
          .set(as(staff.token))
          .expect(403)
      ).body.code,
    ).toBe('role_not_allowed');
    await api(app)
      .get(`/tenant/performance/outcomes?cycleId=${crypto.randomUUID()}`)
      .set(as())
      .expect(404);
  });

  it('keeps improvement plans to one person at a time even when HR and the manager both draft', async () => {
    const { manager, member } = await line();
    const results = await Promise.all([
      draft(member.id, manager.token),
      draft(member.id, kit.admin),
    ]);
    expect(results.map((r) => r.status).toSorted()).toEqual([201, 409]);
    const open = await kit.inTenant((tx) =>
      tx.select().from(improvementPlans).where(eq(improvementPlans.employeeId, member.id)),
    );
    expect(open).toHaveLength(1);
  });
});
