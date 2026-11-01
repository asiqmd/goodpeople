import { createDb, employees, goals, notifications, runAsTenant, tenants, type Tx } from '@gp/db';
import type {
  CycleDetail,
  CycleLaunchResult,
  CycleReviewItem,
  EmployeeDetail,
  GoalStatus,
  OrgSnapshot,
  Page,
  ReviewDetail,
  WorkspaceUserCreated,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq, like } from 'drizzle-orm';
import { api, bearer, tenantLogin, testEnv } from './test-env.js';

// People, companies, goals and cycles in the seeded my-group workspace for the review tests.
// Each test makes its own company, so a cycle over it holds only that test's people.

const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };

export interface PersonOptions {
  managerId?: string;
  orgUnitId?: string;
  /** null: no login. */
  role?: string | null;
  joinedOn?: string;
  /** A probationer whose probation ends then. */
  probationEndsOn?: string;
}

/** Every goal and competency of the review rated the same. */
export const answersFor = (detail: ReviewDetail, rating = 3, comment = 'Steady work') => ({
  goals: Object.fromEntries(detail.goals.map((g) => [g.id, { rating, comment }])),
  competencies: Object.fromEntries(
    detail.cycle.competencies.map((c) => [c.key, { rating, comment }]),
  ),
  overall: comment,
});

export async function reviewsKit(app: INestApplication) {
  const admin = (await tenantLogin(app, 'my-group')).accessToken;
  const org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200))
    .body as OrgSnapshot;
  const { db, pool } = createDb(testEnv().ownerUrl, { max: 2 });
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
  const tenantId = tenant!.id;
  let seq = 0;
  const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
  const designation = (code: string) => org.designations.find((d) => d.code === code)!.id;
  const grade = org.grades.find((g) => g.code === 'W5')!.id;
  /** Reads and writes inside the workspace, as row-level security requires. */
  const inTenant = <T>(fn: (tx: Tx) => Promise<T>) => runAsTenant(db, tenantId, fn);

  const signIn = async (email: string) =>
    (
      await api(app)
        .post('/auth/login')
        .send({ tenant: 'my-group', email, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;

  /** A company of its own, so a cycle over it reviews this test's people only. */
  async function company(): Promise<string> {
    const res = await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(admin))
      .send({ name: `Review Test ${unique()} Ltd` })
      .expect(201);
    return res.body.id as string;
  }

  /** A line in the company, for people who work side by side. */
  async function unit(legalEntityId: string): Promise<string> {
    const code = `L${unique().toUpperCase()}`.slice(0, 20);
    const res = await api(app)
      .post('/tenant/org-units')
      .set(bearer(admin))
      .send({ legalEntityId, kind: 'line', code, name: `Line ${code}` })
      .expect(201);
    return res.body.id as string;
  }

  /** An employee of the company, with a login unless the role is null. */
  async function person(legalEntityId: string, options: PersonOptions = {}) {
    const role = options.role === undefined ? 'employee' : options.role;
    const employeeCode = `RV-${unique().toUpperCase()}`;
    const email = `${employeeCode.toLowerCase()}@example.test`;
    const employee = (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode,
          fullName: `Review Test ${employeeCode}`,
          fullNameBn: `পরীক্ষা ${employeeCode}`,
          fatherName: 'Abdul Karim',
          motherName: 'Hosne Ara',
          dateOfBirth: '1990-03-15',
          gender: 'female',
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: { nid: `${Date.now()}${seq++}`.slice(-10) },
          joinedOn: options.joinedOn ?? '2024-01-01',
          ...(options.probationEndsOn ? { probationEndsOn: options.probationEndsOn } : {}),
          job: {
            legalEntityId,
            designationId: designation('SO'),
            gradeId: grade,
            employmentType: options.probationEndsOn ? 'probationer' : 'permanent',
            workerCategory: 'worker',
            ...(options.managerId ? { managerId: options.managerId } : {}),
            ...(options.orgUnitId ? { orgUnitId: options.orgUnitId } : {}),
          },
          ...(role ? { portalAccess: { email, role, password: testEnv().password } } : {}),
        })
        .expect(201)
    ).body.employee as EmployeeDetail;
    return { id: employee.id, employee, email, token: role ? await signIn(email) : '' };
  }

  /** A workspace login without an employee record, limited to companies when given. */
  async function staff(role: string, companies?: string[]) {
    const email = `rv-staff-${unique()}@example.test`;
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({ name: `Reviewer ${role}`, email, role, password: testEnv().password })
        .expect(201)
    ).body as WorkspaceUserCreated;
    if (companies) {
      await api(app)
        .put(`/tenant/users/${user.id}/scopes`)
        .set(bearer(admin))
        .send({ legalEntityIds: companies })
        .expect(200);
    }
    return { user, email, token: await signIn(email) };
  }

  /** A goal, written straight to the table (the goals API is built alongside). */
  async function goal(
    employeeId: string,
    cycleId: string | null,
    fields: { weight?: string | null; status?: GoalStatus; progress?: number } = {},
  ) {
    const [row] = await inTenant((tx) =>
      tx
        .insert(goals)
        .values({
          tenantId,
          employeeId,
          cycleId,
          title: `Goal ${unique()}`,
          kind: 'objective',
          weight: fields.weight === undefined ? null : fields.weight,
          status: fields.status ?? 'agreed',
          progress: fields.progress ?? 50,
        })
        .returning(),
    );
    return row!;
  }

  /** A draft cycle over these companies, with every step dated. */
  async function cycle(companies: string[], fields: Record<string, unknown> = {}) {
    return (
      await api(app)
        .post('/tenant/performance/cycles')
        .set(bearer(admin))
        .send({
          name: `Cycle ${unique()}`,
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          legalEntityIds: companies,
          selfReview: true,
          peerReview: false,
          goalsDueOn: '2027-01-05',
          selfDueOn: '2027-01-15',
          peerDueOn: '2027-01-15',
          managerDueOn: '2027-01-31',
          calibrationDueOn: '2027-02-15',
          ...fields,
        })
        .expect(201)
    ).body as CycleDetail;
  }

  const launch = async (cycleId: string, token = admin) =>
    (
      await api(app)
        .post(`/tenant/performance/cycles/${cycleId}/launch`)
        .set(bearer(token))
        .expect(200)
    ).body as CycleLaunchResult;

  /** Every review of a cycle, as HR sees them. */
  const reviewsOf = async (cycleId: string) =>
    (
      (
        await api(app)
          .get(`/tenant/performance/cycles/${cycleId}/reviews?pageSize=100`)
          .set(bearer(admin))
          .expect(200)
      ).body as Page<CycleReviewItem>
    ).items;

  const reviewOf = async (cycleId: string, employeeId: string) =>
    (await reviewsOf(cycleId)).find((r) => r.employee.id === employeeId)!;

  const review = async (id: string, token = admin) =>
    (await api(app).get(`/tenant/performance/reviews/${id}`).set(bearer(token)).expect(200))
      .body as ReviewDetail;

  /** The manager's review, submitted with this proposed rating. */
  async function managerSubmit(reviewId: string, token: string, proposedRating: number) {
    const detail = await review(reviewId, token);
    return (
      await api(app)
        .put(`/tenant/performance/reviews/${reviewId}/manager`)
        .set(bearer(token))
        .send({
          answers: answersFor(detail, proposedRating),
          proposedRating,
          recommendations: { increment: proposedRating >= 3, plan: proposedRating <= 2 },
          submit: true,
        })
        .expect(200)
    ).body as ReviewDetail;
  }

  /** Into calibration (with a note for any review missing), every final rating, released. */
  async function settle(cycleId: string, finalRating = 3) {
    await api(app)
      .post(`/tenant/performance/cycles/${cycleId}/calibration`)
      .set(bearer(admin))
      .send({ note: 'Settling in the test' })
      .expect(200);
    for (const r of await reviewsOf(cycleId)) {
      await api(app)
        .put(`/tenant/performance/reviews/${r.id}/final-rating`)
        .set(bearer(admin))
        .send({ finalRating, note: 'Settled in the test' })
        .expect(200);
    }
    return (
      await api(app)
        .post(`/tenant/performance/cycles/${cycleId}/release`)
        .set(bearer(admin))
        .expect(200)
    ).body as CycleDetail;
  }

  /** The notifications of one event someone was sent, by employee (with or without a login). */
  const sentTo = (employeeId: string, event = 'performance.task') =>
    inTenant((tx) =>
      tx
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.employeeId, employeeId),
            eq(notifications.event, event as 'performance.task'),
          ),
        ),
    );

  const keyed = (prefix: string) =>
    inTenant((tx) =>
      tx
        .select()
        .from(notifications)
        .where(like(notifications.dedupeKey, `${prefix}%`)),
    );

  const separate = (employeeId: string) =>
    inTenant((tx) =>
      tx
        .update(employees)
        .set({ status: 'separated', separatedOn: '2026-10-15' })
        .where(eq(employees.id, employeeId)),
    );

  return {
    admin,
    org,
    tenantId,
    inTenant,
    unique,
    designation,
    company,
    unit,
    person,
    staff,
    goal,
    cycle,
    launch,
    reviewsOf,
    reviewOf,
    review,
    answersFor,
    managerSubmit,
    settle,
    sentTo,
    keyed,
    separate,
    close: () => pool.end(),
  };
}
