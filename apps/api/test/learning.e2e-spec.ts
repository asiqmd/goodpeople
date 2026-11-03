import {
  designations,
  jobAssignments,
  learningCertificates,
  notifications,
  tenantAuditLog,
} from '@gp/db';
import {
  addDays,
  todayIn,
  type LearningMe,
  type LearningSessionView,
  type LearningCourseView,
  type TrainingCoverageRow,
  type AuditReportView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { LearningJobs } from '../src/modules/learning/learning-jobs.service.js';
import { runInTenantContext } from '../src/common/request-context.js';
import { recruitmentKit } from './applications-helpers.js';
import { api, bearer, bootApp, tenantLogin } from './test-env.js';
const base = '/tenant/learning';
describe('learning, certificates and buyer training evidence', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof recruitmentKit>>;
  beforeAll(async () => {
    app = await bootApp();
    kit = await recruitmentKit(app);
  });
  afterAll(async () => {
    await kit.close();
    await app.close();
  });
  const as = (t = kit.admin) => bearer(t);
  const now = todayIn();
  async function fixture(
    options: {
      future?: boolean;
      capacity?: number;
      validityMonths?: number | null;
      daysAgo?: number;
    } = {},
  ) {
    const manager = await kit.person();
    const person = await kit.person();
    const second = await kit.person();
    const [designation] = await kit.inTenant((tx) =>
      tx
        .insert(designations)
        .values({
          tenantId: kit.tenantId,
          code: `LT-${kit.unique()}`,
          name: 'Training test operator',
          workerCategory: 'worker',
        })
        .returning(),
    );
    await kit.inTenant((tx) =>
      tx
        .update(jobAssignments)
        .set({ managerId: manager.employee.id, designationId: designation!.id })
        .where(eq(jobAssignments.employeeId, person.employee.id)),
    );
    const course = (
      await api(app)
        .post(`${base}/courses`)
        .set(as())
        .send({
          code: `LT-${kit.unique().toUpperCase()}`,
          name: 'Fire safety training',
          nameBn: 'অগ্নি নিরাপত্তা প্রশিক্ষণ',
          category: 'fire_safety',
          validityMonths: options.validityMonths === undefined ? 12 : options.validityMonths,
        })
        .expect(201)
    ).body as LearningCourseView;
    const date = new Date(Date.now() + (options.future ? 1 : -(options.daysAgo ?? 1)) * 86400000);
    const startsAt = date.toISOString();
    const endsAt = new Date(date.getTime() + 3600000).toISOString();
    const input = {
      courseId: course.id,
      legalEntityId: kit.company('MGT'),
      locationId: kit.org.locations.find((l) => l.code === 'GZP')!.id,
      startsAt,
      endsAt,
      trainer: 'Factory safety trainer',
      venue: 'Training room',
      capacity: options.capacity ?? 10,
    };
    const session = (await api(app).post(`${base}/sessions`).set(as()).send(input).expect(201))
      .body as LearningSessionView;
    const policy = {
      courseId: course.id,
      legalEntityId: kit.company('MGT'),
      designationId: designation!.id,
      effectiveFrom: '2024-01-01',
      graceDays: 30,
    };
    return { person, manager, second, course, session, input, policy };
  }
  const enrol = (id: string, employeeId?: string, token = kit.admin) =>
    api(app)
      .post(`${base}/sessions/${id}/enrol`)
      .set(as(token))
      .send(employeeId ? { employeeId } : {});
  const complete = (id: string, people: { id: string; status?: string }[], token = kit.admin) =>
    api(app)
      .post(`${base}/sessions/${id}/complete`)
      .set(as(token))
      .send({
        note: 'Checked the signed attendance register',
        attendance: people.map((p) => ({ employeeId: p.id, status: p.status ?? 'attended' })),
      });
  const me = async (token: string) =>
    (await api(app).get(`${base}/me`).set(as(token)).expect(200)).body as LearningMe;
  const certs = async (id: string) =>
    kit.inTenant((tx) =>
      tx.select().from(learningCertificates).where(eq(learningCertificates.employeeId, id)),
    );
  it('offers same-company sessions, hides other participants, and enforces capacity under concurrent enrolments', async () => {
    const f = await fixture({ future: true, capacity: 1 });
    const results = await Promise.all([
      enrol(f.session.id, undefined, f.person.token),
      enrol(f.session.id, undefined, f.second.token),
    ]);
    expect(results.map((r) => r.status).toSorted()).toEqual([200, 409]);
    const winner = results[0]!.status === 200 ? f.person : f.second;
    const view = (
      await api(app).get(`${base}/sessions/${f.session.id}`).set(as(winner.token)).expect(200)
    ).body as LearningSessionView;
    expect(view).toMatchObject({
      myStatus: 'enrolled',
      enrolled: 1,
      attendance: [],
      manage: false,
      canWithdraw: true,
    });
    await api(app)
      .post(`${base}/sessions/${f.session.id}/withdraw`)
      .set(as(winner.token))
      .send({ employeeId: f.manager.employee.id })
      .expect(404);
    await api(app)
      .post(`${base}/sessions/${f.session.id}/withdraw`)
      .set(as(winner.token))
      .send({})
      .expect(200);
    await enrol(f.session.id, undefined, winner.token).expect(200);
    const stranger = await kit.person('MGF');
    await api(app).get(`${base}/sessions/${f.session.id}`).set(as(stranger.token)).expect(404);
    await enrol(f.session.id, undefined, stranger.token).expect(400);
    await enrol(f.session.id, f.manager.employee.id, winner.token).expect(404);
  });
  it('records complete attendance once, creates no certificate for absence and snapshots the course policy', async () => {
    const f = await fixture();
    await enrol(f.session.id, f.person.employee.id).expect(200);
    await enrol(f.session.id, f.second.employee.id).expect(200);
    await complete(f.session.id, [{ id: f.person.employee.id }]).expect(400);
    expect(await certs(f.person.employee.id)).toHaveLength(0);
    const done = (
      await complete(f.session.id, [
        { id: f.person.employee.id },
        { id: f.second.employee.id, status: 'absent' },
      ]).expect(200)
    ).body as LearningSessionView;
    expect(done.status).toBe('completed');
    const [c] = await certs(f.person.employee.id);
    expect(c).toMatchObject({
      courseName: f.course.name,
      trainer: f.input.trainer,
      completedOn: todayIn('Asia/Dhaka', new Date(f.input.endsAt)),
    });
    expect(await certs(f.second.employee.id)).toHaveLength(0);
    await complete(f.session.id, [
      { id: f.person.employee.id },
      { id: f.second.employee.id },
    ]).expect(409);
    await enrol(f.session.id, f.manager.employee.id).expect(409);
    await api(app)
      .post(`${base}/sessions/${f.session.id}/cancel`)
      .set(as())
      .send({ reason: 'An invalid correction' })
      .expect(409);
    const own = await me(f.person.token);
    expect(own.certificates.map((x) => x.id)).toContain(c!.id);
    expect((await me(f.second.token)).certificates).toEqual([]);
    const pdf = await api(app)
      .get(`${base}/certificates/${c!.id}/file?language=bn`)
      .set(as(f.person.token))
      .expect(200)
      .expect('content-type', /application\/pdf/);
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    await api(app).get(`${base}/certificates/${c!.id}`).set(as(f.second.token)).expect(404);
    await api(app).get(`${base}/certificates/${c!.id}`).set(as(f.manager.token)).expect(200);
  });
  it('refuses future completion and self enrolment after the start, while HR can enter a historical register', async () => {
    const future = await fixture({ future: true });
    await enrol(future.session.id, future.person.employee.id).expect(200);
    await complete(future.session.id, [{ id: future.person.employee.id }]).expect(400);
    expect(await certs(future.person.employee.id)).toEqual([]);
    const past = await fixture();
    await enrol(past.session.id, undefined, past.person.token).expect(409);
    await enrol(past.session.id, past.person.employee.id).expect(200);
    await complete(past.session.id, [{ id: past.person.employee.id }], past.person.token).expect(
      403,
    );
  });
  it('keeps completion atomic under concurrent requests and supports reasoned cancellation', async () => {
    const f = await fixture();
    await enrol(f.session.id, f.person.employee.id).expect(200);
    const results = await Promise.all([
      complete(f.session.id, [{ id: f.person.employee.id }]),
      complete(f.session.id, [{ id: f.person.employee.id }]),
    ]);
    expect(results.map((r) => r.status).toSorted()).toEqual([200, 409]);
    expect(await certs(f.person.employee.id)).toHaveLength(1);
    const other = await fixture({ future: true });
    await enrol(other.session.id, other.person.employee.id).expect(200);
    await api(app)
      .post(`${base}/sessions/${other.session.id}/cancel`)
      .set(as())
      .send({ reason: 'Trainer unavailable' })
      .expect(200);
    await enrol(other.session.id, other.second.employee.id).expect(409);
    expect(
      (await me(other.person.token)).sessions.find((s) => s.id === other.session.id)?.myStatus,
    ).toBe('cancelled');
  });
  it('reports current and overdue requirements, excludes revoked certificates and preserves records', async () => {
    const f = await fixture();
    await api(app).post(`${base}/requirements`).set(as()).send(f.policy).expect(201);
    await api(app).post(`${base}/requirements`).set(as()).send(f.policy).expect(409);
    expect(
      (await me(f.person.token)).requirements.find((r) => r.course.id === f.course.id)?.state,
    ).toBe('overdue');
    await enrol(f.session.id, f.person.employee.id).expect(200);
    await complete(f.session.id, [{ id: f.person.employee.id }]).expect(200);
    const [c] = await certs(f.person.employee.id);
    expect(
      (await me(f.person.token)).requirements.find((r) => r.course.id === f.course.id)?.state,
    ).toBe('current');
    const team = (await api(app).get(`${base}/team`).set(as(f.manager.token)).expect(200))
      .body as TrainingCoverageRow[];
    expect(team.some((r) => r.employee.id === f.person.employee.id)).toBe(true);
    expect(team.some((r) => r.employee.id === f.second.employee.id)).toBe(false);
    await api(app)
      .post(`${base}/certificates/${c!.id}/revoke`)
      .set(as(f.person.token))
      .send({ reason: 'Incorrect attendance' })
      .expect(403);
    await api(app)
      .post(`${base}/certificates/${c!.id}/revoke`)
      .set(as())
      .send({ reason: 'Incorrect attendance in register' })
      .expect(204);
    expect(
      (await me(f.person.token)).requirements.find((r) => r.course.id === f.course.id)?.state,
    ).toBe('overdue');
    expect((await certs(f.person.employee.id))[0]!.revokeReason).toBe(
      'Incorrect attendance in register',
    );
    await api(app).get(`${base}/certificates/${c!.id}/file`).set(as(f.person.token)).expect(200);
  });
  it('shows expired certificates, keeps archived course history and ends requirements by date', async () => {
    const f = await fixture({ daysAgo: 70, validityMonths: 1 });
    const policy = (
      await api(app).post(`${base}/requirements`).set(as()).send(f.policy).expect(201)
    ).body;
    await enrol(f.session.id, f.person.employee.id).expect(200);
    await complete(f.session.id, [{ id: f.person.employee.id }]).expect(200);
    const own = await me(f.person.token);
    expect(own.certificates[0]!.expiresOn! < now).toBe(true);
    expect(own.requirements.find((r) => r.course.id === f.course.id)?.state).toBe('overdue');
    await api(app)
      .patch(`${base}/courses/${f.course.id}`)
      .set(as())
      .send({ isActive: false })
      .expect(200);
    expect((await me(f.person.token)).certificates).toHaveLength(1);
    await api(app).post(`${base}/sessions`).set(as()).send(f.input).expect(400);
    await api(app)
      .post(`${base}/requirements/${policy.id}/retire`)
      .set(as())
      .send({ effectiveTo: addDays(now, -1), reason: 'Replaced the training policy' })
      .expect(204);
    expect(
      (await me(f.person.token)).requirements.find((r) => r.course.id === f.course.id),
    ).toBeUndefined();
  });
  it('limits HR to their companies and blocks starter/read-only tenants', async () => {
    const f = await fixture({ future: true });
    const mgf = await kit.staff('hr_officer', ['MGF']);
    const mgt = await kit.staff('hr_officer', ['MGT']);
    await api(app).get(`${base}/sessions/${f.session.id}`).set(as(mgf.token)).expect(404);
    await api(app).post(`${base}/sessions`).set(as(mgf.token)).send(f.input).expect(404);
    await api(app).post(`${base}/requirements`).set(as(mgt.token)).send(f.policy).expect(201);
    await api(app)
      .patch(`${base}/courses/${f.course.id}`)
      .set(as(mgt.token))
      .send({ isActive: false })
      .expect(403);
    const starter = (await tenantLogin(app, 'trial-co')).accessToken;
    await api(app).get(`${base}/me`).set(as(starter)).expect(403);
    const overdue = (await tenantLogin(app, 'acme-garments')).accessToken;
    await api(app).post(`${base}/sessions`).set(as(overdue)).send(f.input).expect(403);
    const ngo = (await tenantLogin(app, 'sponsored-ngo')).accessToken;
    await api(app).get(`${base}/sessions/${f.session.id}`).set(as(ngo)).expect(404);
  });
  it('records and voids drills, and includes scoped training and drills in JSON and PDF audit reports', async () => {
    const f = await fixture();
    await api(app).post(`${base}/requirements`).set(as()).send(f.policy).expect(201);
    await enrol(f.session.id, f.person.employee.id).expect(200);
    await complete(f.session.id, [{ id: f.person.employee.id }]).expect(200);
    const input = {
      legalEntityId: kit.company('MGT'),
      locationId: f.input.locationId,
      heldOn: addDays(now, -2),
      nextDueOn: addDays(now, 90),
      participants: 50,
      evacuationSeconds: 180,
      conductor: 'Safety officer',
      findings: 'One exit was slow to clear',
      actions: 'Keep exit routes clear and repeat briefing',
    };
    const drill = (await api(app).post(`${base}/drills`).set(as()).send(input).expect(201)).body;
    await api(app)
      .post(`${base}/drills`)
      .set(as())
      .send({ ...input, heldOn: addDays(now, 1) })
      .expect(400);
    const reportUrl = `/tenant/compliance/audit-report?from=${addDays(now, -90)}&to=${now}&legalEntityId=${kit.company('MGT')}`;
    const report = (await api(app).get(reportUrl).set(as()).expect(200)).body as AuditReportView;
    expect(report.training?.completions).toBeGreaterThan(0);
    expect(report.training?.drills.some((d) => d.id === drill.id)).toBe(true);
    expect(report.training!.current).toBeGreaterThan(0);
    await api(app)
      .get(reportUrl + '&format=pdf&language=bn')
      .set(as())
      .expect(200)
      .expect('content-type', /application\/pdf/);
    const mgf = await kit.staff('hr_officer', ['MGF']);
    await api(app).get(reportUrl).set(as(mgf.token)).expect(404);
    const scoped = (
      await api(app)
        .get(`/tenant/compliance/audit-report?from=${addDays(now, -90)}&to=${now}`)
        .set(as(mgf.token))
        .expect(200)
    ).body as AuditReportView;
    expect(scoped.training?.drills.some((d) => d.id === drill.id)).toBe(false);
    await api(app)
      .post(`${base}/drills/${drill.id}/void`)
      .set(as())
      .send({ reason: 'Wrong register entry corrected' })
      .expect(204);
    const after = (await api(app).get(reportUrl).set(as()).expect(200)).body as AuditReportView;
    expect(after.training?.drills.some((d) => d.id === drill.id)).toBe(false);
  });
  it('deduplicates session and expiry reminders and keeps GETs read-only', async () => {
    const f = await fixture({ daysAgo: 70, validityMonths: 1 });
    await enrol(f.session.id, f.person.employee.id).expect(200);
    await complete(f.session.id, [{ id: f.person.employee.id }]).expect(200);
    const future = await fixture({ future: true });
    await enrol(future.session.id, future.person.employee.id).expect(200);
    const at = new Date(new Date(future.input.startsAt).getTime() - 23 * 3600000);
    await runInTenantContext(kit.tenantId, () => app.get(LearningJobs).remindTenant(at));
    const count = () =>
      kit.inTenant((tx) =>
        tx.select().from(notifications).where(eq(notifications.event, 'learning.notice')),
      );
    const before = (await count()).length;
    await runInTenantContext(kit.tenantId, () => app.get(LearningJobs).remindTenant(at));
    expect((await count()).length).toBe(before);
    const audit = () =>
      kit.inTenant((tx) =>
        tx.select().from(tenantAuditLog).where(eq(tenantAuditLog.entityType, 'learning_session')),
      );
    const rows = await audit();
    await me(f.person.token);
    await api(app).get(`${base}/coverage`).set(as()).expect(200);
    expect(await audit()).toEqual(rows);
  });
});
