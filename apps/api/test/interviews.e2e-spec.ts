import { interviews } from '@gp/db';
import type {
  ApplicationDetail,
  InterviewView,
  MyInterviewDetail,
  MyInterviews,
  NotificationInbox,
  PipelineView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { inDays, pdfCv, recruitmentKit } from './applications-helpers.js';
import { api, bearer, bootApp } from './test-env.js';

const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const line = (ics: string, name: string) =>
  unfold(ics)
    .split('\r\n')
    .find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

const slot = (days = 2, minutes = 0) => ({
  startsAt: inDays(days, minutes),
  endsAt: inDays(days, minutes + 45),
});
const ratings = (skills: number, experience: number) => ({
  'Sewing speed': skills,
  'Quality of stitching': experience,
});

describe('interviews and scorecards', () => {
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

  const as = (token = kit.admin) => bearer(token);

  const schedule = (applicationId: string, body: Record<string, unknown>, token = kit.admin) =>
    api(app)
      .post(`/tenant/recruitment/applications/${applicationId}/interviews`)
      .set(as(token))
      .send({ kind: 'in_person', location: 'Head office, room 2', ...slot(), ...body });
  const mine = async (token: string) =>
    (await api(app).get('/tenant/interviews').set(as(token)).expect(200)).body as MyInterviews;
  const myInterview = (id: string, token: string) =>
    api(app).get(`/tenant/interviews/${id}`).set(as(token));
  const scorecard = (id: string, token: string, body: Record<string, unknown>) =>
    api(app).put(`/tenant/interviews/${id}/scorecard`).set(as(token)).send(body);

  /** An opening with its own criteria, and a candidate on it. */
  async function candidate(fields: Record<string, string> = {}, managerId?: string) {
    const opening = await kit.opening({
      criteria: ['Sewing speed', 'Quality of stitching'],
      hiringManagerEmployeeId: managerId ?? null,
    });
    const email = `interviewee-${kit.unique()}@example.com`;
    const added = await kit.added(opening.id, { email, ...fields }, await pdfCv(['A CV']));
    return { opening, email, ...added };
  }

  it('sends calendar invitations to the candidate and the panel, and tells the panel', async () => {
    const first = await kit.person();
    const second = await kit.person();
    const { applicationId, email, opening } = await candidate({
      fullName: 'Taslima Khatun',
      language: 'bn',
    });
    const interview = (
      await schedule(applicationId, {
        interviewerIds: [first.employee.id, second.employee.id],
      }).expect(201)
    ).body as InterviewView;
    expect(interview).toMatchObject({
      status: 'scheduled',
      panel: [
        { employee: { id: first.employee.id }, submitted: false, scorecard: null },
        { employee: { id: second.employee.id }, submitted: false, scorecard: null },
      ],
    });

    const [toCandidate] = kit.sentTo(email);
    expect(toCandidate!.icalEvent!.method).toBe('REQUEST');
    const ics = toCandidate!.icalEvent!.content;
    expect(line(ics, 'METHOD')).toBe('METHOD:REQUEST');
    expect(line(ics, 'SEQUENCE')).toBe('SEQUENCE:0');
    expect(line(ics, 'UID')).toMatch(new RegExp(`^UID:${interview.id}@`));
    expect(line(ics, 'DTSTART')).toBe(
      `DTSTART:${interview.startsAt.replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')}`,
    );
    expect(line(ics, 'ORGANIZER')).toContain('CN="My Group"');
    expect(unfold(ics)).toContain(`:mailto:${email}`);
    // The candidate's copy keeps the panel's addresses internal.
    expect(unfold(ics)).not.toContain(`:mailto:${first.email}`);
    expect(unfold(kit.sentTo(first.email)[0]!.icalEvent!.content)).toContain(`:mailto:${email}`);
    // In Bangla for a candidate who applied in Bangla.
    expect(toCandidate!.text).toContain('প্রিয় Taslima Khatun');

    for (const p of [first, second]) {
      const [invite] = kit.sentTo(p.email);
      expect(invite!.icalEvent!.method).toBe('REQUEST');
      expect(line(invite!.icalEvent!.content, 'SEQUENCE')).toBe('SEQUENCE:0');
      expect(invite!.text).toContain('/workspace/interviews');
      const inbox = (await api(app).get('/tenant/notifications').set(as(p.token)).expect(200))
        .body as NotificationInbox;
      expect(inbox.items).toContainEqual(
        expect.objectContaining({
          event: 'recruitment.interview',
          link: '/workspace/interviews',
          title: expect.stringContaining('Taslima Khatun'),
          body: expect.stringContaining('New interview.'),
        }),
      );
    }

    const application = (
      await api(app).get(`/tenant/recruitment/applications/${applicationId}`).set(as()).expect(200)
    ).body as ApplicationDetail;
    expect(application.stage).toBe('interview');
    expect(application.events.slice(-2).map((e) => [e.kind, e.note ?? e.toStage])).toEqual([
      ['interview', 'scheduled'],
      ['stage', 'interview'],
    ]);
    const board = (
      await api(app)
        .get(`/tenant/recruitment/openings/${opening.id}/pipeline`)
        .set(as())
        .expect(200)
    ).body as PipelineView;
    expect(board.columns.find((c) => c.stage === 'interview')!.applications).toEqual([
      expect.objectContaining({ id: applicationId, interviews: 1 }),
    ]);
  });

  it('refuses an interview in the past, without a place or link, or with someone who cannot sign in', async () => {
    const interviewer = await kit.person();
    const { applicationId } = await candidate();
    const past = await schedule(applicationId, {
      ...slot(-1),
      interviewerIds: [interviewer.employee.id],
    }).expect(400);
    expect(past.body.code).toBe('interview_in_past');
    const video = await schedule(applicationId, {
      kind: 'video',
      interviewerIds: [interviewer.employee.id],
    }).expect(400);
    expect(video.body.issues).toEqual([expect.objectContaining({ path: 'meetingUrl' })]);
    const withoutLogin = await kit.person('MGT', null);
    const noLogin = await schedule(applicationId, {
      interviewerIds: [interviewer.employee.id, withoutLogin.employee.id],
    }).expect(400);
    expect(noLogin.body.code).toBe('interviewer_without_login');
    const choices = (
      await api(app)
        .get(
          `/tenant/recruitment/applications/${applicationId}/interviewers?search=${interviewer.employee.employeeCode}`,
        )
        .set(as())
        .expect(200)
    ).body as { id: string }[];
    expect(choices.map((c) => c.id)).toEqual([interviewer.employee.id]);
  });

  it('updates the invitation with a higher sequence when it moves, and cancels it', async () => {
    const staying = await kit.person();
    const leaving = await kit.person();
    const joining = await kit.person();
    const { applicationId, email } = await candidate();
    const interview = (
      await schedule(applicationId, {
        interviewerIds: [staying.employee.id, leaving.employee.id],
      }).expect(201)
    ).body as InterviewView;

    const moved = await api(app)
      .patch(`/tenant/interviews/${interview.id}`)
      .set(as())
      .send({
        kind: 'video',
        meetingUrl: 'https://meet.example.com/abc-defg-hij',
        ...slot(4),
        interviewerIds: [staying.employee.id, joining.employee.id],
      })
      .expect(200);
    expect((moved.body as InterviewView).panel.map((p) => p.employee.id)).toEqual([
      staying.employee.id,
      joining.employee.id,
    ]);
    const update = kit.sentTo(email).at(-1)!;
    expect(update.subject).toMatch(/^Interview moved/);
    expect(update.icalEvent!.method).toBe('REQUEST');
    expect(line(update.icalEvent!.content, 'SEQUENCE')).toBe('SEQUENCE:1');
    expect(line(update.icalEvent!.content, 'UID')).toBe(
      line(kit.sentTo(email)[0]!.icalEvent!.content, 'UID'),
    );
    expect(unfold(update.icalEvent!.content)).toContain(
      'URL:https://meet.example.com/abc-defg-hij',
    );
    expect(kit.sentTo(joining.email).at(-1)!.subject).toMatch(/^Interview: /);
    const gone = kit.sentTo(leaving.email).at(-1)!;
    expect(gone.icalEvent!.method).toBe('CANCEL');
    expect(line(gone.icalEvent!.content, 'SEQUENCE')).toBe('SEQUENCE:1');
    const told = (await api(app).get('/tenant/notifications').set(as(staying.token)).expect(200))
      .body as NotificationInbox;
    expect(told.items[0]!.body).toContain('Changed: time (was ');
    expect(told.items[0]!.body).toContain('type (now by video)');
    expect((await mine(leaving.token)).upcoming.map((i) => i.id)).not.toContain(interview.id);

    await api(app)
      .post(`/tenant/interviews/${interview.id}/cancel`)
      .set(as())
      .send({ reason: 'The candidate asked to move it' })
      .expect(200)
      .expect((res) => expect((res.body as InterviewView).status).toBe('cancelled'));
    const cancel = kit.sentTo(email).at(-1)!;
    expect(cancel.icalEvent!.method).toBe('CANCEL');
    expect(line(cancel.icalEvent!.content, 'METHOD')).toBe('METHOD:CANCEL');
    expect(line(cancel.icalEvent!.content, 'SEQUENCE')).toBe('SEQUENCE:2');
    expect(line(cancel.icalEvent!.content, 'STATUS')).toBe('STATUS:CANCELLED');
    expect(kit.sentTo(joining.email).at(-1)!.icalEvent!.method).toBe('CANCEL');
    const again = await api(app)
      .patch(`/tenant/interviews/${interview.id}`)
      .set(as())
      .send({ kind: 'phone', ...slot(5), interviewerIds: [staying.employee.id] })
      .expect(409);
    expect(again.body.code).toBe('interview_not_scheduled');
  });

  it('shows each interviewer only the interviews they are on, with what they need', async () => {
    const mine1 = await kit.person();
    const other = await kit.person();
    const a = await candidate({ fullName: 'Rokeya Sultana', coverNote: 'I worked at Ha-Meem' });
    const b = await candidate();
    const one = (
      await schedule(a.applicationId, { interviewerIds: [mine1.employee.id] }).expect(201)
    ).body as InterviewView;
    const two = (
      await schedule(b.applicationId, { interviewerIds: [other.employee.id] }).expect(201)
    ).body as InterviewView;

    const list = await mine(mine1.token);
    expect(list.upcoming.map((i) => i.id)).toEqual([one.id]);
    expect(list.upcoming[0]).toMatchObject({
      candidateName: 'Rokeya Sultana',
      opening: { id: a.opening.id },
      submitted: false,
    });
    const view = (await myInterview(one.id, mine1.token).expect(200)).body as MyInterviewDetail;
    expect(view).toMatchObject({
      candidateName: 'Rokeya Sultana',
      coverNote: 'I worked at Ha-Meem',
      hasCv: true,
      criteria: ['Sewing speed', 'Quality of stitching'],
      scorable: true,
      mine: null,
      others: [],
    });
    await myInterview(two.id, mine1.token).expect(404);
    await myInterview(one.id, kit.admin).expect(404);
    await api(app)
      .get(`/tenant/recruitment/applications/${a.applicationId}`)
      .set(as(mine1.token))
      .expect(404);
    await api(app)
      .get(`/tenant/recruitment/openings/${a.opening.id}/pipeline`)
      .set(as(mine1.token))
      .expect(404);
    await api(app)
      .get(`/tenant/recruitment/applications/${b.applicationId}/cv`)
      .set(as(mine1.token))
      .expect(404);
    await scorecard(two.id, mine1.token, {
      ratings: ratings(3, 3),
      recommendation: 'yes',
    }).expect(404);
    // Changing the interview is not theirs either.
    await api(app)
      .post(`/tenant/interviews/${one.id}/cancel`)
      .set(as(mine1.token))
      .send({})
      .expect(404);
  });

  it('hides the other scorecards until an interviewer has submitted their own', async () => {
    const manager = await kit.person();
    const first = await kit.person();
    const second = await kit.person();
    const later = await kit.person();
    const { applicationId, opening } = await candidate({}, manager.employee.id);
    const interview = (
      await schedule(
        applicationId,
        { interviewerIds: [first.employee.id, second.employee.id] },
        manager.token,
      ).expect(201)
    ).body as InterviewView;
    const another = (
      await schedule(
        applicationId,
        { ...slot(6), interviewerIds: [later.employee.id] },
        manager.token,
      ).expect(201)
    ).body as InterviewView;

    const submitted = (
      await scorecard(interview.id, first.token, {
        ratings: ratings(4, 5),
        recommendation: 'strong_yes',
        feedback: 'Fast and careful',
      }).expect(200)
    ).body as MyInterviewDetail;
    expect(submitted.mine).toMatchObject({
      ratings: ratings(4, 5),
      recommendation: 'strong_yes',
      feedback: 'Fast and careful',
    });
    expect(submitted.others).toEqual([]);
    // The second interviewer has not submitted, so sees nothing of the first's: only that the
    // first is on the panel and has submitted.
    const before = (await myInterview(interview.id, second.token).expect(200))
      .body as MyInterviewDetail;
    expect(before.others).toEqual([]);
    expect(before.panel).toEqual(
      expect.arrayContaining([
        {
          employee: expect.objectContaining({ id: first.employee.id }),
          submitted: true,
          scorecard: null,
        },
        {
          employee: expect.objectContaining({ id: second.employee.id }),
          submitted: false,
          scorecard: null,
        },
      ]),
    );
    expect(
      ((await myInterview(another.id, later.token).expect(200)).body as MyInterviewDetail).others,
    ).toEqual([]);

    const secondView = (
      await scorecard(interview.id, second.token, {
        ratings: ratings(2, 3),
        recommendation: 'no',
      }).expect(200)
    ).body as MyInterviewDetail;
    expect(secondView.others).toEqual([
      {
        employee: expect.objectContaining({ id: first.employee.id }),
        scorecard: expect.objectContaining({ recommendation: 'strong_yes' }),
      },
    ]);
    expect(
      ((await myInterview(interview.id, first.token).expect(200)).body as MyInterviewDetail).others,
    ).toEqual([
      expect.objectContaining({ employee: expect.objectContaining({ id: second.employee.id }) }),
    ]);
    // Once theirs is in, an interviewer on another interview of the application sees both.
    const laterView = (
      await scorecard(another.id, later.token, {
        ratings: ratings(3, 3),
        recommendation: 'yes',
      }).expect(200)
    ).body as MyInterviewDetail;
    expect(laterView.others).toHaveLength(2);

    // The hiring manager and HR see every scorecard.
    for (const token of [manager.token, kit.admin]) {
      const seen = (
        await api(app)
          .get(`/tenant/recruitment/applications/${applicationId}`)
          .set(as(token))
          .expect(200)
      ).body as ApplicationDetail;
      expect(
        seen.interviews.flatMap((i) => i.panel.map((p) => p.scorecard?.recommendation)),
      ).toEqual(['strong_yes', 'no', 'yes']);
    }
    const board = (
      await api(app)
        .get(`/tenant/recruitment/openings/${opening.id}/pipeline`)
        .set(as(manager.token))
        .expect(200)
    ).body as PipelineView;
    // (4 + 5 + 2 + 3 + 3 + 3) / 6
    expect(board.columns.find((c) => c.stage === 'interview')!.applications[0]!.averageRating).toBe(
      3.3,
    );

    // An interviewer may change theirs until the application closes.
    await scorecard(interview.id, second.token, {
      ratings: ratings(3, 3),
      recommendation: 'yes',
    }).expect(200);
    await api(app)
      .post(`/tenant/recruitment/applications/${applicationId}/stage`)
      .set(as(manager.token))
      .send({ stage: 'rejected', reason: 'Chose another candidate' })
      .expect(200);
    const closed = await scorecard(interview.id, second.token, {
      ratings: ratings(1, 1),
      recommendation: 'strong_no',
    }).expect(409);
    expect(closed.body.code).toBe('application_closed');
  });

  it('wants a rating from 1 to 5 for each of the opening’s criteria', async () => {
    const interviewer = await kit.person();
    const { applicationId } = await candidate();
    const interview = (
      await schedule(applicationId, { interviewerIds: [interviewer.employee.id] }).expect(201)
    ).body as InterviewView;
    const missing = await scorecard(interview.id, interviewer.token, {
      ratings: { 'Sewing speed': 4 },
      recommendation: 'yes',
    }).expect(400);
    expect(missing.body.code).toBe('scorecard_criteria');
    const extra = await scorecard(interview.id, interviewer.token, {
      ratings: { ...ratings(4, 4), Punctuality: 5 },
      recommendation: 'yes',
    }).expect(400);
    expect(extra.body.code).toBe('scorecard_criteria');
    const outOfRange = await scorecard(interview.id, interviewer.token, {
      ratings: ratings(6, 4),
      recommendation: 'yes',
    }).expect(400);
    expect(outOfRange.body.code).toBe('validation_failed');
    await scorecard(interview.id, interviewer.token, {
      ratings: ratings(4, 4),
      recommendation: 'maybe',
    }).expect(400);
    await scorecard(interview.id, interviewer.token, {
      ratings: ratings(4, 4),
      recommendation: 'yes',
    }).expect(200);
  });

  it('completes an interview once it has started, and lists it as past', async () => {
    const interviewer = await kit.person();
    const { applicationId } = await candidate();
    const interview = (
      await schedule(applicationId, { interviewerIds: [interviewer.employee.id] }).expect(201)
    ).body as InterviewView;
    const early = await api(app)
      .post(`/tenant/interviews/${interview.id}/complete`)
      .set(as())
      .expect(409);
    expect(early.body.code).toBe('interview_not_started');
    await kit.inTenant((tx) =>
      tx
        .update(interviews)
        .set({
          startsAt: sql`now() - interval '2 hours'`,
          endsAt: sql`now() - interval '1 hour'`,
        })
        .where(eq(interviews.id, interview.id)),
    );
    const done = (
      await api(app).post(`/tenant/interviews/${interview.id}/complete`).set(as()).expect(200)
    ).body as InterviewView;
    expect(done.status).toBe('completed');
    const list = await mine(interviewer.token);
    expect(list.upcoming.map((i) => i.id)).not.toContain(interview.id);
    expect(list.past.map((i) => i.id)).toContain(interview.id);
    // Scorecards can still come in after it.
    await scorecard(interview.id, interviewer.token, {
      ratings: ratings(4, 4),
      recommendation: 'yes',
    }).expect(200);
  });
});
