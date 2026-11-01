import { tenantAuditLog } from '@gp/db';
import type { CalibrationView, CycleDetail, ReviewDetail } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { answersFor, reviewsKit } from './reviews-helpers.js';
import { api, bearer, bootApp } from './test-env.js';

describe('calibration, release and closing', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof reviewsKit>>;

  beforeAll(async () => {
    app = await bootApp();
    kit = await reviewsKit(app);
  });
  afterAll(async () => {
    await kit.close();
    await app.close();
  });

  const as = (token = kit.admin) => bearer(token);
  const calibrate = (cycleId: string, body: Record<string, unknown> = {}) =>
    api(app).post(`/tenant/performance/cycles/${cycleId}/calibration`).set(as()).send(body);
  const finalRating = (reviewId: string, body: Record<string, unknown>, token = kit.admin) =>
    api(app).put(`/tenant/performance/reviews/${reviewId}/final-rating`).set(as(token)).send(body);
  const release = (cycleId: string) =>
    api(app).post(`/tenant/performance/cycles/${cycleId}/release`).set(as());
  const view = async (cycleId: string, query = '') =>
    (
      await api(app)
        .get(`/tenant/performance/cycles/${cycleId}/calibration${query}`)
        .set(as())
        .expect(200)
    ).body as CalibrationView;

  /** A team of `n` reviewed by their manager alone, each review submitted with its rating. */
  async function team(ratings: number[]) {
    const company = await kit.company();
    const manager = await kit.person(company);
    const people = [];
    for (let i = 0; i < ratings.length; i++) {
      people.push(await kit.person(company, { managerId: manager.id }));
    }
    const cycle = await kit.cycle([company], { selfReview: false });
    await kit.launch(cycle.id);
    const reviews = [];
    for (const [i, p] of people.entries()) {
      const { id } = await kit.reviewOf(cycle.id, p.id);
      await kit.managerSubmit(id, manager.token, ratings[i]!);
      reviews.push(id);
    }
    return { company, manager, people, cycle, reviews };
  }

  it('moves to calibration once the manager reviews are in, or by choice with a note', async () => {
    const { cycle, manager } = await team([3, 4]);
    // The manager's own review, which HR writes, is still missing.
    const missing = await calibrate(cycle.id).expect(409);
    expect(missing.body).toMatchObject({ code: 'manager_reviews_missing' });
    expect(missing.body.message).toMatch(/^1 review has no manager review yet/);
    const moved = (await calibrate(cycle.id, { note: 'Rafiq is on leave' }).expect(200))
      .body as CycleDetail;
    expect(moved.status).toBe('calibration');
    const [entry] = await kit.inTenant((tx) =>
      tx
        .select()
        .from(tenantAuditLog)
        .where(
          and(
            eq(tenantAuditLog.entityId, cycle.id),
            eq(tenantAuditLog.action, 'review_cycle.calibration'),
          ),
        ),
    );
    expect(entry!.after).toMatchObject({
      note: 'Rafiq is on leave',
      missing: [expect.objectContaining({ employeeId: manager.id, status: 'manager' })],
    });
    expect((await calibrate(cycle.id).expect(409)).body.code).toBe('cycle_status');

    // With every manager review in, no note is needed; HR writes the manager's own.
    const whole = await team([3]);
    const draft = await kit.cycle([whole.company]);
    expect((await calibrate(draft.id).expect(409)).body.code).toBe('cycle_status');
    await kit.managerSubmit(
      (await kit.reviewOf(whole.cycle.id, whole.manager.id)).id,
      kit.admin,
      4,
    );
    await calibrate(whole.cycle.id).expect(200);
    expect((await view(whole.cycle.id)).missing).toEqual({ managerReviews: 0, finalRatings: 2 });
  });

  it('settles final ratings, with a reason whenever one differs from the proposal', async () => {
    const { cycle, reviews, manager, people, company } = await team([4, 2]);
    const officer = await kit.person(company, { managerId: manager.id, role: 'hr_officer' });
    await kit.launch(cycle.id);
    await calibrate(cycle.id, { note: 'Manager reviews for HR staff come later' }).expect(200);
    const [kept, changed] = reviews as [string, string];

    const same = (await finalRating(kept, { finalRating: 4 }).expect(200)).body as ReviewDetail;
    expect(same).toMatchObject({
      finalRating: 4,
      calibration: { note: null, by: expect.any(String) },
      managerReview: { proposedRating: 4 },
    });
    expect(same.calibration?.at).not.toBeNull();
    const noReason = await finalRating(changed, { finalRating: 3 }).expect(400);
    expect(noReason.body.code).toBe('calibration_note_required');
    const moved = (
      await finalRating(changed, {
        finalRating: 3,
        note: 'Line output recovered after the machine fault in June',
      }).expect(200)
    ).body as ReviewDetail;
    expect(moved).toMatchObject({
      finalRating: 3,
      managerReview: { proposedRating: 2 },
      calibration: { note: 'Line output recovered after the machine fault in June' },
    });
    const [audit] = await kit.inTenant((tx) =>
      tx
        .select()
        .from(tenantAuditLog)
        .where(
          and(
            eq(tenantAuditLog.entityId, changed),
            eq(tenantAuditLog.action, 'review.final_rating'),
          ),
        ),
    );
    expect(audit!.after).toMatchObject({ finalRating: 3, proposedRating: 2 });

    // Not the manager, not the person, and not HR on their own review.
    await finalRating(changed, { finalRating: 3, note: 'x' }, manager.token).expect(403);
    await finalRating(changed, { finalRating: 3, note: 'x' }, people[1]!.token).expect(403);
    const own = await kit.reviewOf(cycle.id, officer.id);
    expect(
      (await finalRating(own.id, { finalRating: 5, note: 'Mine' }, officer.token).expect(403)).body
        .code,
    ).toBe('own_review');
    const officerView = (
      await api(app)
        .get(`/tenant/performance/cycles/${cycle.id}/calibration`)
        .set(as(officer.token))
        .expect(200)
    ).body as CalibrationView;
    expect(officerView.people.some((p) => p.employee.id === officer.id)).toBe(false);
    expect(officerView.people.some((p) => p.reviewId === changed)).toBe(true);
    // The person sees nothing of it before release.
    expect((await kit.review(changed, people[1]!.token)).finalRating).toBeNull();
  });

  it('shows how proposed and final ratings spread against the guide, by manager', async () => {
    const guide = { 1: 10, 2: 20, 3: 40, 4: 20, 5: 10 };
    const settings = (await api(app).get('/tenant/performance/settings').set(as()).expect(200))
      .body;
    const save = (ratingGuide: object) =>
      api(app)
        .put('/tenant/performance/settings')
        .set(as())
        .send({ competencies: settings.competencies, ratingGuide })
        .expect(200);
    await save(guide);
    onTestFinished(async () => {
      await save(settings.ratingGuide);
    });
    const { cycle, reviews, manager, company } = await team([3, 3, 4, 2]);
    // A second manager in the same cycle.
    const other = await kit.person(company);
    const theirs = await kit.person(company, { managerId: other.id });
    await kit.launch(cycle.id);
    await kit.managerSubmit((await kit.reviewOf(cycle.id, theirs.id)).id, other.token, 5);
    await calibrate(cycle.id, { note: 'Managers reviewed by the director later' }).expect(200);
    await finalRating(reviews[3]!, {
      finalRating: 3,
      note: 'Recovered in the last quarter',
    }).expect(200);

    const all = await view(cycle.id);
    expect(all.guide).toEqual(guide);
    expect(all.filters.managers.map((m) => m.id).toSorted()).toEqual(
      [manager.id, other.id].toSorted(),
    );
    expect(all.filters.legalEntities.map((e) => e.id)).toEqual([company]);
    // Five proposals among seven people (the two managers have none).
    expect(all.distribution.proposed).toEqual([
      { rating: 1, count: 0, percent: 0, guidePercent: 10 },
      { rating: 2, count: 1, percent: 20, guidePercent: 20 },
      { rating: 3, count: 2, percent: 40, guidePercent: 40 },
      { rating: 4, count: 1, percent: 20, guidePercent: 20 },
      { rating: 5, count: 1, percent: 20, guidePercent: 10 },
    ]);
    expect(all.distribution.final.map((r) => r.count)).toEqual([0, 0, 1, 0, 0]);
    expect(all.missing).toEqual({ managerReviews: 2, finalRatings: 6 });
    const row = all.people.find((p) => p.reviewId === reviews[2]);
    expect(row).toMatchObject({
      proposedRating: 4,
      finalRating: null,
      goalScore: null,
      manager: expect.objectContaining({ id: manager.id }),
      recommendations: { increment: true, plan: false, promotion: null },
    });

    const mine = await view(cycle.id, `?managerEmployeeId=${manager.id}`);
    expect(mine.people.map((p) => p.reviewId).toSorted()).toEqual([...reviews].toSorted());
    expect(mine.distribution.proposed.map((r) => r.count)).toEqual([0, 1, 2, 1, 0]);
    expect(mine.distribution.proposed.map((r) => r.percent)).toEqual([0, 25, 50, 25, 0]);
  });

  it('refuses to release while a final rating is missing, then releases and tells people', async () => {
    const { cycle, reviews, manager, people, company } = await team([3, 4]);
    const noLogin = await kit.person(company, { managerId: manager.id, role: null });
    await kit.launch(cycle.id);
    const third = (await kit.reviewOf(cycle.id, noLogin.id)).id;
    await kit.managerSubmit(third, manager.token, 3);
    expect((await release(cycle.id).expect(409)).body.code).toBe('cycle_status');
    await calibrate(cycle.id, { note: 'Manager reviewed later' }).expect(200);
    await finalRating(reviews[0]!, { finalRating: 3 }).expect(200);
    await finalRating(reviews[1]!, { finalRating: 4 }).expect(200);
    await finalRating(third, { finalRating: 3 }).expect(200);
    const refused = await release(cycle.id).expect(409);
    expect(refused.body).toMatchObject({
      code: 'final_ratings_missing',
      message: '1 review has no final rating yet',
    });
    const own = await kit.reviewOf(cycle.id, manager.id);
    await finalRating(own.id, { finalRating: 3, note: 'Settled by the director' }).expect(200);

    const released = (await release(cycle.id).expect(200)).body as CycleDetail;
    expect(released).toMatchObject({
      status: 'released',
      progress: { byStatus: { released: 4, calibration: 0 } },
    });
    expect(released.releasedAt).not.toBeNull();
    for (const p of people) {
      expect(await kit.sentTo(p.id, 'performance.released')).toEqual([
        expect.objectContaining({
          title: `Your review for ${cycle.name} is ready`,
          link: '/workspace/performance',
        }),
      ]);
    }
    expect(await kit.sentTo(noLogin.id, 'performance.released')).toEqual([]);
    expect(await kit.sentTo(manager.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: `Reviews released: ${cycle.name}` }),
      ]),
    );
    expect((await kit.review(reviews[1]!, people[1]!.token)).finalRating).toBe(4);
  });

  it('never changes a released review, and closes the cycle after release', async () => {
    const { cycle, reviews, manager, people } = await team([3]);
    const close = () => api(app).post(`/tenant/performance/cycles/${cycle.id}/close`).set(as());
    expect((await close().expect(409)).body.code).toBe('cycle_status');
    await kit.settle(cycle.id, 3);
    const [id] = reviews as [string];

    expect(
      (await finalRating(id, { finalRating: 4, note: 'Late change' }).expect(409)).body.code,
    ).toBe('review_released');
    const detail = await kit.review(id, manager.token);
    expect(
      (
        await api(app)
          .put(`/tenant/performance/reviews/${id}/manager`)
          .set(as(manager.token))
          .send({ answers: answersFor(detail, 5), proposedRating: 5 })
          .expect(409)
      ).body.code,
    ).toBe('review_step_closed');
    expect(detail.can).toMatchObject({ writeManager: false, calibrate: false });
    expect((await calibrate(cycle.id, { note: 'Again' }).expect(409)).body.code).toBe(
      'cycle_status',
    );
    expect(
      (await api(app).post(`/tenant/performance/cycles/${cycle.id}/launch`).set(as()).expect(409))
        .body.code,
    ).toBe('cycle_status');
    expect((await view(cycle.id)).canChange).toBe(false);

    const closed = (await close().expect(200)).body as CycleDetail;
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).not.toBeNull();
    expect((await close().expect(409)).body.code).toBe('cycle_status');
    // The person still reads and acknowledges theirs.
    await api(app)
      .post(`/tenant/performance/reviews/${id}/acknowledge`)
      .set(as(people[0]!.token))
      .send({ agrees: true })
      .expect(200);
    expect((await kit.review(id, people[0]!.token)).finalRating).toBe(3);
  });
});
