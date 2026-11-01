import { probationReviews } from '@gp/db';
import type {
  CycleDetail,
  EmployeeRef,
  PeerInbox,
  PeerRequestView,
  PerformanceMe,
  PerformanceSettingsView,
  ReviewDetail,
  TeamReviewItem,
} from '@gp/shared';
import { DEFAULT_COMPETENCIES } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { runInTenantContext } from '../src/common/request-context.js';
import { ReviewJobs } from '../src/modules/reviews/review-jobs.service.js';
import { reviewsKit } from './reviews-helpers.js';
import { api, bearer, bootApp } from './test-env.js';

describe('review cycles, reviews and peer feedback', () => {
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
  const saveSelf = (id: string, token: string, body: Record<string, unknown>) =>
    api(app).put(`/tenant/performance/reviews/${id}/self`).set(as(token)).send(body);
  const saveManager = (id: string, token: string, body: Record<string, unknown>) =>
    api(app).put(`/tenant/performance/reviews/${id}/manager`).set(as(token)).send(body);
  const me = async (token: string) =>
    (await api(app).get('/tenant/performance/me').set(as(token)).expect(200)).body as PerformanceMe;

  it('keeps the competencies and the ratings guide, which new cycles start from', async () => {
    // The workspace's settings are shared with every other test: put them back after.
    const before = (await api(app).get('/tenant/performance/settings').set(as()).expect(200))
      .body as PerformanceSettingsView;
    onTestFinished(async () => {
      await api(app)
        .put('/tenant/performance/settings')
        .set(as())
        .send({ competencies: before.competencies, ratingGuide: before.ratingGuide })
        .expect(200);
    });
    const competencies = [
      ...DEFAULT_COMPETENCIES.slice(0, 2),
      { key: 'line_balance', en: 'Line balancing', bn: 'লাইন ব্যালান্সিং' },
    ];
    const ratingGuide = { 1: 5, 2: 15, 3: 50, 4: 20, 5: 10 };
    const saved = (
      await api(app)
        .put('/tenant/performance/settings')
        .set(as())
        .send({ competencies, ratingGuide })
        .expect(200)
    ).body as PerformanceSettingsView;
    expect(saved).toMatchObject({ competencies, ratingGuide });
    expect(saved.updatedAt).not.toBeNull();

    const company = await kit.company();
    const cycle = await kit.cycle([company]);
    expect(cycle.competencies).toEqual(competencies);
    expect(cycle.status).toBe('draft');

    const off = await api(app)
      .put('/tenant/performance/settings')
      .set(as())
      .send({ competencies, ratingGuide: { ...ratingGuide, 5: 20 } })
      .expect(400);
    expect(off.body.code).toBe('validation_failed');
    const twice = await api(app)
      .put('/tenant/performance/settings')
      .set(as())
      .send({ competencies: [competencies[0], competencies[0]], ratingGuide })
      .expect(400);
    expect(twice.body.issues).toEqual([expect.objectContaining({ path: 'competencies.1.key' })]);
    const worker = await kit.person(company);
    await api(app).get('/tenant/performance/settings').set(as(worker.token)).expect(403);
  });

  it('launches a review for each person in the cycle, with their manager that day', async () => {
    const [company, other] = [await kit.company(), await kit.company()];
    const manager = await kit.person(company);
    const operator = await kit.person(company, { managerId: manager.id });
    const noLogin = await kit.person(company, { managerId: manager.id, role: null });
    const noManager = await kit.person(company);
    const late = await kit.person(company, { managerId: manager.id, joinedOn: '2026-09-01' });
    const left = await kit.person(company, { managerId: manager.id });
    await kit.separate(left.id);
    const elsewhere = await kit.person(other);

    const undated = await kit.cycle([company], { managerDueOn: null, calibrationDueOn: null });
    const refused = await api(app)
      .post(`/tenant/performance/cycles/${undated.id}/launch`)
      .set(as())
      .expect(400);
    expect(refused.body.code).toBe('cycle_dates_missing');

    const cycle = await kit.cycle([company], { joinedOnOrBefore: '2026-06-30' });
    // HR of another company neither sees nor launches it.
    const outsider = await kit.staff('hr_officer', [other]);
    await api(app)
      .get(`/tenant/performance/cycles/${cycle.id}`)
      .set(as(outsider.token))
      .expect(404);
    await api(app)
      .post(`/tenant/performance/cycles/${cycle.id}/launch`)
      .set(as(outsider.token))
      .expect(404);

    const launched = await kit.launch(cycle.id);
    expect(launched.created).toBe(4);
    expect(launched.cycle).toMatchObject({ status: 'active' });
    expect(launched.cycle.launchedAt).not.toBeNull();
    const rows = await kit.reviewsOf(cycle.id);
    const byPerson = new Map(rows.map((r) => [r.employee.id, r]));
    expect([...byPerson.keys()].toSorted()).toEqual(
      [manager.id, operator.id, noLogin.id, noManager.id].toSorted(),
    );
    expect(byPerson.get(operator.id)).toMatchObject({
      status: 'self',
      manager: expect.objectContaining({ id: manager.id }),
    });
    // Without a login, the manager reviews them alone.
    expect(byPerson.get(noLogin.id)).toMatchObject({
      status: 'manager',
      manager: expect.objectContaining({ id: manager.id }),
    });
    expect(byPerson.get(noManager.id)).toMatchObject({ status: 'self', manager: null });
    for (const outside of [late, left, elsewhere]) expect(byPerson.has(outside.id)).toBe(false);
    expect(launched.cycle.progress).toMatchObject({
      total: 4,
      byStatus: { self: 3, manager: 1, calibration: 0, released: 0, acknowledged: 0 },
      noManager: 2,
    });

    // The person is asked for their self review; the manager about the review that is theirs.
    expect(await kit.sentTo(operator.id)).toEqual([
      expect.objectContaining({ title: 'Your self review' }),
    ]);
    expect(await kit.sentTo(noLogin.id)).toEqual([]);
    expect(await kit.sentTo(manager.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Your self review',
        }),
        expect.objectContaining({
          title: `Review ${noLogin.employee.fullName}`,
          link: `/workspace/performance/reviews/${byPerson.get(noLogin.id)!.id}`,
        }),
      ]),
    );

    // Launching again adds only who has come in since; HR adds a late joiner by hand, once.
    expect((await kit.launch(cycle.id)).created).toBe(0);
    const newcomer = await kit.person(company, { managerId: manager.id, role: null });
    expect((await kit.launch(cycle.id)).created).toBe(1);
    expect((await kit.reviewOf(cycle.id, newcomer.id)).status).toBe('manager');
    const add = (employeeId: string) =>
      api(app).post(`/tenant/performance/cycles/${cycle.id}/people`).set(as()).send({ employeeId });
    expect((await add(late.id).expect(201)).body.created).toBe(1);
    expect((await add(late.id).expect(409)).body.code).toBe('already_in_cycle');
    expect((await add(elsewhere.id).expect(409)).body.code).toBe('not_in_cycle_companies');
    expect((await add(left.id).expect(409)).body.code).toBe('employee_separated');

    // HR of the company sees it; a drafted cycle can still change, a launched one only its dates.
    const own = await kit.staff('hr_officer', [company]);
    const seen = (
      await api(app).get(`/tenant/performance/cycles/${cycle.id}`).set(as(own.token)).expect(200)
    ).body as CycleDetail;
    expect(seen).toMatchObject({ canChange: true, progress: { total: 6 } });
    const edit = await api(app)
      .patch(`/tenant/performance/cycles/${cycle.id}`)
      .set(as())
      .send({ name: 'Renamed', periodStart: '2026-01-01', periodEnd: '2026-12-31' })
      .expect(409);
    expect(edit.body.code).toBe('cycle_status');
    const moved = (
      await api(app)
        .put(`/tenant/performance/cycles/${cycle.id}/dates`)
        .set(as())
        .send({ name: cycle.name, selfDueOn: '2027-01-20', managerDueOn: '2027-02-05' })
        .expect(200)
    ).body as CycleDetail;
    expect(moved).toMatchObject({ selfDueOn: '2027-01-20', managerDueOn: '2027-02-05' });
    // An HR officer limited to a company cannot make a cycle for every company.
    const mine = (
      await api(app)
        .post('/tenant/performance/cycles')
        .set(as(own.token))
        .send({ name: 'Scoped', periodStart: '2026-01-01', periodEnd: '2026-12-31' })
        .expect(201)
    ).body as CycleDetail;
    expect(mine.legalEntityIds).toEqual([company]);
    await api(app)
      .post('/tenant/performance/cycles')
      .set(as(own.token))
      .send({
        name: 'Elsewhere',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        legalEntityIds: [other],
      })
      .expect(403);
  });

  it('takes the self review, then the manager review, which fixes the goal score', async () => {
    const company = await kit.company();
    const manager = await kit.person(company);
    const worker = await kit.person(company, { managerId: manager.id });
    const cycle = await kit.cycle([company]);
    const first = await kit.goal(worker.id, cycle.id, { weight: '60.00', progress: 80 });
    const second = await kit.goal(worker.id, cycle.id, { weight: '40.00', status: 'completed' });
    await kit.goal(worker.id, cycle.id, { status: 'draft' });
    await kit.goal(worker.id, null);
    await kit.launch(cycle.id);
    const { id } = await kit.reviewOf(cycle.id, worker.id);

    const mine = await kit.review(id, worker.token);
    expect(mine).toMatchObject({
      role: 'person',
      status: 'self',
      can: { writeSelf: true, writeManager: false, acknowledge: false },
      managerReview: null,
      finalRating: null,
    });
    expect(mine.goals.map((g) => g.id)).toEqual([first.id, second.id]);
    expect(mine.goals[0]).toMatchObject({ weight: '60.00', progress: 80 });
    // The manager sees nothing of a self review not yet submitted.
    expect((await kit.review(id, manager.token)).self).toBeNull();

    const answers = kit.answersFor(mine, 4, 'Kept the line running');
    await saveSelf(id, worker.token, {
      answers: { goals: { [first.id]: { rating: 4 } }, competencies: {} },
    }).expect(200);
    const missing = await saveSelf(id, worker.token, {
      answers: { goals: { [first.id]: { rating: 4 } }, competencies: {} },
      submit: true,
    }).expect(400);
    expect(missing.body.code).toBe('ratings_missing');
    const stranger = await kit.goal(manager.id, cycle.id);
    const unknown = await saveSelf(id, worker.token, {
      answers: { goals: { [stranger.id]: { rating: 3 } }, competencies: {} },
    }).expect(400);
    expect(unknown.body.code).toBe('unknown_goal');
    const submitted = (await saveSelf(id, worker.token, { answers, submit: true }).expect(200))
      .body as ReviewDetail;
    expect(submitted.status).toBe('manager');
    expect(submitted.self?.submittedAt).not.toBeNull();
    expect((await saveSelf(id, worker.token, { answers }).expect(409)).body.code).toBe(
      'review_step_closed',
    );
    expect(await kit.sentTo(manager.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: `Review ${worker.employee.fullName}`,
          link: `/workspace/performance/reviews/${id}`,
        }),
      ]),
    );

    const theirs = await kit.review(id, manager.token);
    expect(theirs).toMatchObject({
      role: 'manager',
      can: { writeManager: true, writeSelf: false },
      self: { answers: { overall: 'Kept the line running' } },
    });
    const promotion = kit.org.designations.find((d) => d.code !== 'SO')!;
    const noRating = await saveManager(id, manager.token, {
      answers: kit.answersFor(theirs, 3),
      submit: true,
    }).expect(400);
    expect(noRating.body.code).toBe('proposed_rating_required');
    const done = (
      await saveManager(id, manager.token, {
        answers: {
          ...kit.answersFor(theirs, 3),
          goals: { [first.id]: { rating: 4 }, [second.id]: { rating: 3 } },
        },
        proposedRating: 4,
        recommendations: { increment: true, promotionDesignationId: promotion.id, plan: false },
        submit: true,
      }).expect(200)
    ).body as ReviewDetail;
    // 4 × 60% + 3 × 40%
    expect(done).toMatchObject({
      status: 'calibration',
      goalScore: '3.60',
      managerReview: {
        proposedRating: 4,
        recommendations: {
          increment: true,
          promotion: { id: promotion.id, name: promotion.name },
          plan: false,
        },
      },
    });
    expect(
      (await saveManager(id, manager.token, { answers: kit.answersFor(theirs) }).expect(409)).body
        .code,
    ).toBe('review_step_closed');
    // Until release the person sees none of it.
    expect(await kit.review(id, worker.token)).toMatchObject({
      managerReview: null,
      goalScore: null,
      finalRating: null,
      calibration: null,
    });
  });

  it('shows a review only to the person, their line of management and HR, never a line-mate', async () => {
    const [company, other] = [await kit.company(), await kit.company()];
    const line = await kit.unit(company);
    const head = await kit.person(company);
    const manager = await kit.person(company, { managerId: head.id });
    const worker = await kit.person(company, { managerId: manager.id, orgUnitId: line });
    // Same line, another supervisor: a colleague, not in the worker's line of management.
    const supervisor = await kit.person(company, { managerId: head.id });
    const lineMate = await kit.person(company, { managerId: supervisor.id, orgUnitId: line });
    const loner = await kit.person(company);
    const stranger = await kit.person(company);
    const peer = await kit.person(company);
    const hr = await kit.staff('hr_officer');
    const otherHr = await kit.staff('hr_officer', [other]);
    const cycle = await kit.cycle([company], { peerReview: true });
    await kit.launch(cycle.id);
    const { id } = await kit.reviewOf(cycle.id, worker.id);
    await api(app)
      .post(`/tenant/performance/reviews/${id}/peers`)
      .set(as(manager.token))
      .send({ employeeIds: [peer.id] })
      .expect(200);

    for (const token of [stranger.token, peer.token, otherHr.token, lineMate.token]) {
      await api(app).get(`/tenant/performance/reviews/${id}`).set(as(token)).expect(404);
      await saveManager(id, token, { answers: { goals: {}, competencies: {} } }).expect(404);
    }
    expect((await kit.review(id, worker.token)).role).toBe('person');
    expect((await kit.review(id, manager.token)).role).toBe('manager');
    // Anyone above the manager may write it too.
    expect((await kit.review(id, head.token)).role).toBe('manager');
    expect((await kit.review(id, hr.token)).role).toBe('hr');

    const detail = await kit.review(id, worker.token);
    await saveSelf(id, worker.token, { answers: kit.answersFor(detail), submit: true }).expect(200);
    expect(
      (await saveSelf(id, manager.token, { answers: kit.answersFor(detail) }).expect(403)).body
        .code,
    ).toBe('not_your_part');
    expect(
      (await saveManager(id, worker.token, { answers: kit.answersFor(detail) }).expect(403)).body
        .code,
    ).toBe('not_your_part');
    // HR does not write the manager's part where there is a manager…
    expect(
      (await saveManager(id, hr.token, { answers: kit.answersFor(detail) }).expect(403)).body.code,
    ).toBe('not_your_part');
    await saveManager(id, head.token, { answers: kit.answersFor(detail, 4) }).expect(200);

    // …and does where there is none.
    const lonely = await kit.reviewOf(cycle.id, loner.id);
    const theirs = await kit.review(lonely.id, loner.token);
    await saveSelf(lonely.id, loner.token, {
      answers: kit.answersFor(theirs),
      submit: true,
    }).expect(200);
    expect((await kit.review(lonely.id, hr.token)).can.writeManager).toBe(true);
    await kit.managerSubmit(lonely.id, hr.token, 3);

    // The team page lists the reviews a manager writes or oversees.
    const team = (await api(app).get('/tenant/performance/team').set(as(head.token)).expect(200))
      .body as TeamReviewItem[];
    expect(
      team.filter((r) => r.cycle.id === cycle.id).map((r) => [r.employee.id, r.direct]),
    ).toEqual(
      expect.arrayContaining([
        [manager.id, true],
        [worker.id, false],
      ]),
    );
  });

  it('takes peer feedback, and shows the person only the answers together, from three or more', async () => {
    const company = await kit.company();
    const manager = await kit.person(company);
    const worker = await kit.person(company, { managerId: manager.id });
    const second = await kit.person(company, { managerId: manager.id });
    const peers = [
      await kit.person(company),
      await kit.person(company),
      await kit.person(company),
      await kit.person(company),
    ];
    const noLogin = await kit.person(company, { role: null });
    const cycle = await kit.cycle([company], { peerReview: true });
    await kit.launch(cycle.id);
    const { id } = await kit.reviewOf(cycle.id, worker.id);
    const secondId = (await kit.reviewOf(cycle.id, second.id)).id;
    const propose = (reviewId: string, token: string, employeeIds: string[]) =>
      api(app)
        .post(`/tenant/performance/reviews/${reviewId}/peers`)
        .set(as(token))
        .send({ employeeIds });

    const choices = (
      await api(app)
        .get(`/tenant/performance/reviews/${id}/peer-choices`)
        .set(as(worker.token))
        .expect(200)
    ).body as EmployeeRef[];
    const chosen = new Set(choices.map((c) => c.id));
    for (const p of peers) expect(chosen.has(p.id)).toBe(true);
    for (const p of [worker, manager, noLogin]) expect(chosen.has(p.id)).toBe(false);
    for (const wrong of [manager.id, noLogin.id, worker.id]) {
      expect((await propose(id, worker.token, [wrong]).expect(400)).body.code).toBe(
        'peer_not_allowed',
      );
    }
    const named = (
      await propose(
        id,
        worker.token,
        peers.map((p) => p.id),
      ).expect(200)
    ).body as ReviewDetail;
    expect(named.peerProposals?.map((p) => p.status)).toEqual([
      'proposed',
      'proposed',
      'proposed',
      'proposed',
    ]);
    expect(await kit.sentTo(manager.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: `Approve peers for ${worker.employee.fullName}` }),
      ]),
    );

    const inbox = (
      await api(app).get('/tenant/performance/peers').set(as(manager.token)).expect(200)
    ).body as PeerInbox;
    const waiting = inbox.toApprove.filter((p) => p.reviewId === id);
    expect(waiting).toHaveLength(4);
    const requestOf = (peerId: string) => waiting.find((w) => w.peer.id === peerId)!.id;
    // Not asked until approved.
    await api(app)
      .get(`/tenant/performance/peers/${requestOf(peers[0]!.id)}`)
      .set(as(peers[0]!.token))
      .expect(404);
    const decide = (peerId: string, approve: boolean, token = manager.token) =>
      api(app)
        .post(`/tenant/performance/peers/${requestOf(peerId)}/decision`)
        .set(as(token))
        .send({ approve });
    await decide(peers[0]!.id, true, worker.token).expect(404);
    for (const p of peers.slice(0, 3)) await decide(p.id, true).expect(200);
    await decide(peers[3]!.id, false).expect(200);
    expect((await decide(peers[3]!.id, true).expect(409)).body.code).toBe('peer_decided');
    await api(app)
      .get(`/tenant/performance/peers/${requestOf(peers[3]!.id)}`)
      .set(as(peers[3]!.token))
      .expect(404);
    // The manager's own picks are approved at once.
    await propose(secondId, manager.token, [peers[0]!.id, peers[1]!.id]).expect(200);
    expect(
      (await kit.sentTo(peers[0]!.id)).filter((n) => n.title.startsWith('Feedback on')),
    ).toHaveLength(2);

    const answer = async (peer: (typeof peers)[number], reviewId: string, n: number) => {
      const asked = (
        (await api(app).get('/tenant/performance/peers').set(as(peer.token)).expect(200))
          .body as PeerInbox
      ).toAnswer;
      const request = asked.find((a) =>
        reviewId === id ? a.person.id === worker.id : a.person.id === second.id,
      )!;
      expect(request).toMatchObject({ status: 'approved', open: true });
      const res = await api(app)
        .put(`/tenant/performance/peers/${request.id}`)
        .set(as(peer.token))
        .send({
          answers: { strengths: `Strength ${n}`, improvements: `Improve ${n}` },
          rating: n,
        })
        .expect(200);
      return { request, view: res.body as PeerRequestView };
    };
    for (const [i, p] of peers.slice(0, 3).entries()) {
      const { view } = await answer(p, id, i + 3);
      expect(view).toMatchObject({ status: 'submitted', open: false, rating: i + 3 });
    }
    const { request: once } = await answer(peers[0]!, secondId, 2);
    const twice = await api(app)
      .put(`/tenant/performance/peers/${once.id}`)
      .set(as(peers[0]!.token))
      .send({ answers: { strengths: 'Again', improvements: 'Again' }, rating: 5 })
      .expect(409);
    expect(twice.body.code).toBe('peer_answered');
    await answer(peers[1]!, secondId, 3);

    // Before release the person sees whom they named, never who has answered.
    const before = await kit.review(id, worker.token);
    expect(before.peers).toBeNull();
    expect(before.peerProposals?.map((p) => p.status).toSorted()).toEqual([
      'approved',
      'approved',
      'approved',
      'declined',
    ]);
    // The manager reads it with names.
    const withNames = await kit.review(id, manager.token);
    expect(
      withNames.peers
        ?.filter((p) => p.status === 'submitted')
        .map((p) => [p.peer.id, p.rating])
        .toSorted(),
    ).toEqual(
      [
        [peers[0]!.id, 3],
        [peers[1]!.id, 4],
        [peers[2]!.id, 5],
      ].toSorted(),
    );

    await kit.settle(cycle.id);
    const after = (
      await api(app).get(`/tenant/performance/reviews/${id}`).set(as(worker.token)).expect(200)
    ).body as ReviewDetail;
    expect(after.peerSummary).toEqual({
      shown: true,
      answers: {
        strengths: ['Strength 3', 'Strength 4', 'Strength 5'],
        improvements: ['Improve 3', 'Improve 4', 'Improve 5'],
      },
      averageRating: 4,
    });
    expect(after.peers).toBeNull();
    expect(after.peerProposals).toBeNull();
    // Nothing in what the person receives names a peer.
    const sent = JSON.stringify(after);
    const peerRows = withNames.peers!;
    for (const p of peers) {
      for (const mark of [p.id, p.employee.fullName, p.employee.employeeCode]) {
        expect(sent).not.toContain(`"${mark}"`);
      }
    }
    for (const row of peerRows) expect(sent).not.toContain(`"${row.id}"`);

    // Two answers are too few to show at all.
    const few = await kit.review(secondId, second.token);
    expect(few.peerSummary).toEqual({
      shown: false,
      answers: { strengths: [], improvements: [] },
      averageRating: null,
    });
    // Released: the peers can no longer answer or change theirs.
    const closed = (
      (await api(app).get('/tenant/performance/peers').set(as(peers[2]!.token)).expect(200))
        .body as PeerInbox
    ).toAnswer.find((a) => a.person.id === worker.id)!;
    expect(closed.open).toBe(false);
  });

  it('reminds whoever a step waits on, three days before and on the day, once each', async () => {
    const jobs = app.get(ReviewJobs);
    const company = await kit.company();
    const manager = await kit.person(company);
    const worker = await kit.person(company, { managerId: manager.id });
    const operator = await kit.person(company, { managerId: manager.id, role: null });
    const peer = await kit.person(company);
    // Far-off dates of its own, so no other test's cycle is due on these days.
    const cycle = await kit.cycle([company], {
      peerReview: true,
      goalsDueOn: '2031-03-01',
      selfDueOn: '2031-03-10',
      peerDueOn: '2031-03-10',
      managerDueOn: '2031-03-20',
      calibrationDueOn: '2031-03-31',
    });
    await kit.launch(cycle.id);
    const { id } = await kit.reviewOf(cycle.id, worker.id);
    await api(app)
      .post(`/tenant/performance/reviews/${id}/peers`)
      .set(as(manager.token))
      .send({ employeeIds: [peer.id] })
      .expect(200);
    const remind = (date: string, hour = 10) =>
      runInTenantContext(kit.tenantId, () =>
        jobs.remindTenant(new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+06:00`)),
      );
    const reminders = async (employeeId: string, step: 'self' | 'peer' | 'manager') =>
      (await kit.sentTo(employeeId)).filter((n) =>
        n.dedupeKey?.startsWith(`review.remind.${step}:${cycle.id}`),
      );

    expect(await remind('2031-03-07', 7)).toBe(0);
    expect(await remind('2031-03-06')).toBe(0);
    await remind('2031-03-07');
    await remind('2031-03-08');
    expect((await reminders(worker.id, 'self')).map((n) => n.title)).toEqual(['Your self review']);
    expect((await reminders(peer.id, 'peer')).map((n) => n.title)).toEqual(['Peer feedback']);
    expect(await reminders(worker.id, 'peer')).toEqual([]);
    expect(await reminders(manager.id, 'manager')).toEqual([]);

    await remind('2031-03-10');
    await remind('2031-03-10');
    expect(await reminders(worker.id, 'self')).toHaveLength(2);
    expect(await reminders(peer.id, 'peer')).toHaveLength(2);

    // The manager, once, for the review waiting on them; then on the day.
    await remind('2031-03-17');
    await remind('2031-03-18');
    expect(await reminders(manager.id, 'manager')).toEqual([
      expect.objectContaining({
        title: "Your team's reviews",
        body: expect.stringContaining('One review for'),
      }),
    ]);
    await remind('2031-03-20');
    expect(await reminders(manager.id, 'manager')).toHaveLength(2);
    expect(await kit.sentTo(operator.id)).toEqual([]);
  });

  it('takes the person’s acknowledgement of their released review, once', async () => {
    const company = await kit.company();
    const manager = await kit.person(company);
    const worker = await kit.person(company, { managerId: manager.id });
    const cycle = await kit.cycle([company], { selfReview: false });
    await kit.launch(cycle.id);
    const { id } = await kit.reviewOf(cycle.id, worker.id);
    await kit.managerSubmit(id, manager.token, 2);
    const acknowledge = (token: string, body: Record<string, unknown>) =>
      api(app).post(`/tenant/performance/reviews/${id}/acknowledge`).set(as(token)).send(body);
    expect((await acknowledge(worker.token, { agrees: true }).expect(409)).body.code).toBe(
      'review_not_released',
    );
    await kit.settle(cycle.id, 2);
    expect(await kit.sentTo(worker.id, 'performance.released')).toEqual([
      expect.objectContaining({ title: `Your review for ${cycle.name} is ready` }),
    ]);

    const released = await kit.review(id, worker.token);
    expect(released).toMatchObject({
      status: 'released',
      finalRating: 2,
      goalScore: null,
      can: { acknowledge: true },
      managerReview: { proposedRating: null, recommendations: null },
      calibration: null,
    });
    expect(released.managerReview?.answers?.overall).toBe('Steady work');
    expect((await me(worker.token)).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'acknowledge', id })]),
    );
    await acknowledge(manager.token, { agrees: true }).expect(403);
    const done = (
      await acknowledge(worker.token, {
        agrees: false,
        comment: 'The target changed in March',
      }).expect(200)
    ).body as ReviewDetail;
    expect(done).toMatchObject({
      status: 'acknowledged',
      acknowledgement: { agrees: false, comment: 'The target changed in March' },
    });
    expect((await acknowledge(worker.token, { agrees: true }).expect(409)).body.code).toBe(
      'already_acknowledged',
    );
    for (const token of [manager.token, kit.admin]) {
      expect((await kit.review(id, token)).acknowledgement).toMatchObject({
        agrees: false,
        comment: 'The target changed in March',
      });
    }
    expect((await me(worker.token)).items.some((t) => t.id === id)).toBe(false);
  });

  it('counts what waits for the login', async () => {
    const company = await kit.company();
    const manager = await kit.person(company);
    const worker = await kit.person(company, { managerId: manager.id });
    const operator = await kit.person(company, {
      managerId: manager.id,
      role: null,
      joinedOn: '2026-09-01',
      probationEndsOn: '2026-11-30',
    });
    const peer = await kit.person(company);
    const cycle = await kit.cycle([company], { peerReview: true });
    await kit.goal(worker.id, cycle.id, { status: 'draft' });
    await kit.goal(worker.id, cycle.id, { status: 'draft' });
    await kit.goal(worker.id, cycle.id, { status: 'agreed', progress: 40 });
    await kit.launch(cycle.id);
    const review = await kit.reviewOf(cycle.id, worker.id);
    await api(app)
      .post(`/tenant/performance/reviews/${review.id}/peers`)
      .set(as(worker.token))
      .send({ employeeIds: [peer.id] })
      .expect(200);
    const managerReview = await kit.reviewOf(cycle.id, manager.id);
    await api(app)
      .post(`/tenant/performance/reviews/${managerReview.id}/peers`)
      .set(as(kit.admin))
      .send({ employeeIds: [peer.id] })
      .expect(200);
    const [probation] = await kit.inTenant((tx) =>
      tx
        .insert(probationReviews)
        .values({
          tenantId: kit.tenantId,
          employeeId: operator.id,
          managerEmployeeId: manager.id,
          probationEndsOn: '2026-11-30',
        })
        .returning(),
    );

    const mine = await me(worker.token);
    expect(mine.items.map((t) => t.kind)).toEqual(['self_review']);
    expect(mine).toMatchObject({
      tasks: 1,
      manage: false,
      manager: false,
      goals: { total: 3, draft: 2, agreed: 1, completed: 0, progress: 47 },
      reviews: [expect.objectContaining({ id: review.id, status: 'self', finalRating: null })],
    });

    const theirs = await me(manager.token);
    expect(theirs.manager).toBe(true);
    expect(theirs.items.map((t) => t.kind).toSorted()).toEqual(
      [
        'goals_agree',
        'manager_review',
        'peer_approve',
        'probation_review',
        'self_review',
      ].toSorted(),
    );
    expect(theirs.tasks).toBe(5);
    expect(theirs.items.find((t) => t.kind === 'goals_agree')).toMatchObject({
      count: 2,
      person: expect.objectContaining({ id: worker.id }),
    });
    expect(theirs.items.find((t) => t.kind === 'manager_review')).toMatchObject({
      person: expect.objectContaining({ id: operator.id }),
      dueOn: cycle.managerDueOn,
    });
    expect(theirs.items.find((t) => t.kind === 'probation_review')?.id).toBe(probation!.id);

    // The peer answers only what was approved: the manager's own picks on HR's review.
    const peerMe = await me(peer.token);
    expect(peerMe.items.map((t) => t.kind).toSorted()).toEqual(['peer_answer', 'self_review']);
    expect(peerMe.items.find((t) => t.kind === 'peer_answer')?.person?.id).toBe(manager.id);

    // The worker submits; the peer task stays with the peer only, the review moves on.
    await saveSelf(review.id, worker.token, {
      answers: kit.answersFor(await kit.review(review.id, worker.token)),
      submit: true,
    }).expect(200);
    expect((await me(worker.token)).tasks).toBe(0);
    expect((await me(manager.token)).items.filter((t) => t.kind === 'manager_review')).toHaveLength(
      2,
    );

    const asked = (await kit.sentTo(peer.id)).map((n) => n.title);
    expect(asked).toContain(`Feedback on ${manager.employee.fullName}`);
    expect(asked).not.toContain(`Feedback on ${worker.employee.fullName}`);
  });
});
