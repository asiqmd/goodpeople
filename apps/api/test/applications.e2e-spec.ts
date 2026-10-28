import {
  applicationEvents,
  applications,
  candidates,
  interviewPanel,
  jobOpenings,
  tenantAuditLog,
} from '@gp/db';
import type {
  ApplicationDetail,
  CandidateDetail,
  CandidateListItem,
  CvContacts,
  InterviewView,
  MyInterviewDetail,
  Page,
  PipelineView,
  RecruitmentMe,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { runInTenantContext } from '../src/common/request-context.js';
import { CandidateRetentionJobs } from '../src/modules/applications/retention-jobs.service.js';
import type { FileStore } from '../src/storage/file-store.js';
import { FILE_STORE } from '../src/storage/storage.module.js';
import { inDays, pdfCv, recruitmentKit } from './applications-helpers.js';
import { binary } from './payroll-helpers.js';
import { api, bearer, bootApp } from './test-env.js';

describe('candidates and the pipeline', () => {
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
  const detail = async (id: string, token = kit.admin) =>
    (await api(app).get(`/tenant/recruitment/applications/${id}`).set(as(token)).expect(200))
      .body as ApplicationDetail;
  const candidate = async (id: string) =>
    (await api(app).get(`/tenant/recruitment/candidates/${id}`).set(as()).expect(200))
      .body as CandidateDetail;
  const move = (id: string, body: Record<string, unknown>, token = kit.admin) =>
    api(app).post(`/tenant/recruitment/applications/${id}/stage`).set(as(token)).send(body);
  const schedule = (applicationId: string, interviewerIds: string[]) =>
    api(app)
      .post(`/tenant/recruitment/applications/${applicationId}/interviews`)
      .set(as())
      .send({
        kind: 'in_person',
        startsAt: inDays(3),
        endsAt: inDays(3, 30),
        location: 'Gazipur factory, HR room',
        interviewerIds,
      })
      .expect(201)
      .then((res) => res.body as InterviewView);

  it('adds a candidate by hand with their CV and consent, and finds the same person again', async () => {
    const store = app.get<FileStore>(FILE_STORE);
    const first = await kit.opening();
    const second = await kit.opening();
    const referrer = await kit.person();
    const phone = kit.mobile();
    const email = `Nusrat.${kit.unique()}@Example.com`;
    const cv = await pdfCv(['Nusrat Jahan', `Mobile: ${phone}`]);
    const res = await kit
      .add(
        first.id,
        {
          fullName: 'Nusrat Jahan',
          email,
          phone,
          source: 'walk_in',
          language: 'bn',
          notes: 'Came to the gate with her CV',
          coverNote: 'Six years on single-needle machines',
        },
        { bytes: cv, name: 'nusrat cv.pdf' },
      )
      .expect(201);
    expect(res.body).toMatchObject({ newCandidate: true });
    const { candidateId, applicationId } = res.body;

    const person = await candidate(candidateId);
    expect(person).toMatchObject({
      fullName: 'Nusrat Jahan',
      email: email.toLowerCase(),
      phone: `+88${phone}`,
      source: 'walk_in',
      language: 'bn',
      notes: 'Came to the gate with her CV',
      talentPool: false,
      hired: false,
      erasedAt: null,
      cv: { fileName: 'nusrat cv.pdf', contentType: 'application/pdf', sizeBytes: cv.length },
    });
    expect(person.consentAt).not.toBeNull();
    expect(person.applications).toEqual([
      expect.objectContaining({ id: applicationId, stage: 'applied', source: 'walk_in' }),
    ]);
    const application = await detail(applicationId);
    expect(application.coverNote).toBe('Six years on single-needle machines');
    expect(application.events).toEqual([
      expect.objectContaining({ kind: 'stage', toStage: 'applied', actor: expect.anything() }),
    ]);

    // The same mobile number, written another way, is the same person.
    const again = await kit
      .add(second.id, {
        fullName: 'Nusrat J.',
        email: '',
        phone: `+88${phone}`,
        source: 'referral',
        referredByEmployeeId: referrer.employee.id,
        notes: 'Referred again by the line chief',
      })
      .expect(201);
    expect(again.body).toMatchObject({ candidateId, newCandidate: false });
    const both = await candidate(candidateId);
    expect(both.fullName).toBe('Nusrat Jahan');
    expect(both.notes).toBe('Came to the gate with her CV\n\nReferred again by the line chief');
    expect(both.applications.map((a) => a.opening.id).toSorted()).toEqual(
      [first.id, second.id].toSorted(),
    );
    expect(both.language).toBe('bn');

    // Refused again for the same opening, keeping the CV she has.
    const keyOf = async () =>
      (
        await kit.inTenant((tx) =>
          tx
            .select({ key: candidates.cvStorageKey })
            .from(candidates)
            .where(eq(candidates.id, candidateId)),
        )
      )[0]!.key!;
    const firstCv = await keyOf();
    const twice = await kit
      .add(
        first.id,
        { email, fullName: 'Nusrat Jahan' },
        { bytes: await pdfCv(['Another CV']), name: 'new.pdf' },
      )
      .expect(409);
    expect(twice.body.code).toBe('already_applied');
    expect(await keyOf()).toBe(firstCv);
    expect(await store.get(firstCv)).toBeInstanceOf(Buffer);
    // A new CV with a new application replaces the old one, whose file goes.
    const third = await kit.opening();
    await kit
      .add(third.id, { email }, { bytes: await pdfCv(['Updated CV']), name: 'updated.pdf' })
      .expect(201);
    expect(await keyOf()).not.toBe(firstCv);
    await expect(store.get(firstCv)).rejects.toThrow();
    expect((await candidate(candidateId)).cv?.fileName).toBe('updated.pdf');

    // Found by name, email or mobile number; filtered by opening.
    const found = async (query: string) =>
      (
        (await api(app).get(`/tenant/recruitment/candidates?${query}`).set(as()).expect(200))
          .body as Page<CandidateListItem>
      ).items.map((c) => c.id);
    expect(await found(`search=${encodeURIComponent(email.toUpperCase())}`)).toEqual([candidateId]);
    expect(await found(`search=${phone}`)).toContain(candidateId);
    expect(await found(`openingId=${second.id}`)).toEqual([candidateId]);
    expect(await found(`openingId=${second.id}&talentPool=true`)).toEqual([]);
  });

  it('refuses a candidate without consent, contact details or a readable CV', async () => {
    const opening = await kit.opening();
    const noConsent = await kit.add(opening.id, { consent: 'false' }).expect(400);
    expect(noConsent.body.issues).toEqual([expect.objectContaining({ path: 'consent' })]);
    const noContact = await kit.add(opening.id, { email: '' }).expect(400);
    expect(noContact.body.issues).toEqual([expect.objectContaining({ path: 'email' })]);
    const notCareers = await kit.add(opening.id, { source: 'careers_page' }).expect(400);
    expect(notCareers.body.code).toBe('validation_failed');
    const text = await kit
      .add(opening.id, {}, { bytes: Buffer.from('just text'), name: 'cv.pdf' })
      .expect(415);
    expect(text.body.code).toBe('cv_type');
    const big = await kit
      .add(opening.id, {}, { bytes: Buffer.alloc(5 * 1024 * 1024 + 1, 0x25), name: 'cv.pdf' })
      .expect(413);
    expect(big.body.code).toBe('cv_too_large');
    const draft = await kit.opening({ status: 'draft' });
    expect((await kit.add(draft.id).expect(409)).body.code).toBe('opening_not_taking_candidates');
    const employee = await kit.person();
    await kit.add(opening.id, {}, undefined, employee.token).expect(403);
  });

  it('moves applications through the stages and records each move with who made it', async () => {
    const opening = await kit.opening();
    const { applicationId } = await kit.added(opening.id);

    const screened = (await move(applicationId, { stage: 'screening' }).expect(200))
      .body as ApplicationDetail;
    expect(screened.stage).toBe('screening');
    expect(screened.moves).toEqual(['applied', 'interview', 'offer', 'rejected', 'withdrawn']);
    expect(screened.events.at(-1)).toMatchObject({
      kind: 'stage',
      fromStage: 'applied',
      toStage: 'screening',
      actor: { name: expect.any(String) },
    });

    expect((await move(applicationId, { stage: 'hired' }).expect(400)).body.code).toBe(
      'validation_failed',
    );
    const noReason = await move(applicationId, { stage: 'rejected' }).expect(400);
    expect(noReason.body.issues).toEqual([expect.objectContaining({ path: 'reason' })]);
    const rejected = (
      await move(applicationId, { stage: 'rejected', reason: 'No experience on overlock' }).expect(
        200,
      )
    ).body as ApplicationDetail;
    expect(rejected).toMatchObject({
      stage: 'rejected',
      rejectionReason: 'No experience on overlock',
      moves: ['screening'],
    });
    const stuck = await move(applicationId, { stage: 'interview' }).expect(409);
    expect(stuck.body.code).toBe('stage_move_not_allowed');

    // HR may reopen a rejected one, back to screening.
    const reopened = (await move(applicationId, { stage: 'screening' }).expect(200))
      .body as ApplicationDetail;
    expect(reopened).toMatchObject({ stage: 'screening', rejectionReason: null });

    const noted = (
      await api(app)
        .post(`/tenant/recruitment/applications/${applicationId}/notes`)
        .set(as())
        .send({ note: 'Can start in December' })
        .expect(201)
    ).body as ApplicationDetail;
    expect(noted.events.map((e) => [e.kind, e.toStage ?? e.note])).toEqual([
      ['stage', 'applied'],
      ['stage', 'screening'],
      ['stage', 'rejected'],
      ['stage', 'screening'],
      ['note', 'Can start in December'],
    ]);

    const board = (
      await api(app)
        .get(`/tenant/recruitment/openings/${opening.id}/pipeline`)
        .set(as())
        .expect(200)
    ).body as PipelineView;
    expect(board.columns.map((c) => c.stage)).toEqual([
      'applied',
      'screening',
      'interview',
      'offer',
      'hired',
      'rejected',
      'withdrawn',
    ]);
    expect(board.columns.find((c) => c.stage === 'screening')!.applications).toEqual([
      expect.objectContaining({ id: applicationId, interviews: 0, averageRating: null }),
    ]);
    expect(board.manage).toBe(true);
  });

  it('lets the hiring manager move candidates, but not strangers or logins of other companies', async () => {
    const manager = await kit.person();
    const opening = await kit.opening({ hiringManagerEmployeeId: manager.employee.id });
    const { applicationId, candidateId } = await kit.added(opening.id);

    await api(app)
      .get(`/tenant/recruitment/openings/${opening.id}/pipeline`)
      .set(as(manager.token))
      .expect(200)
      .expect((res) => expect((res.body as PipelineView).manage).toBe(false));
    expect(
      (await move(applicationId, { stage: 'screening' }, manager.token).expect(200)).body,
    ).toMatchObject({ stage: 'screening', manage: false });
    await api(app)
      .post(`/tenant/recruitment/applications/${applicationId}/notes`)
      .set(as(manager.token))
      .send({ note: 'Strong on overlock' })
      .expect(201);
    await move(applicationId, { stage: 'rejected', reason: 'Not this time' }, manager.token).expect(
      200,
    );
    // Reopening is for HR only.
    expect((await detail(applicationId, manager.token)).moves).toEqual([]);
    await move(applicationId, { stage: 'screening' }, manager.token).expect(409);
    // Candidates themselves are HR's.
    await api(app)
      .get(`/tenant/recruitment/candidates/${candidateId}`)
      .set(as(manager.token))
      .expect(403);

    const stranger = await kit.person();
    await api(app)
      .get(`/tenant/recruitment/openings/${opening.id}/pipeline`)
      .set(as(stranger.token))
      .expect(404);
    await api(app)
      .get(`/tenant/recruitment/applications/${applicationId}`)
      .set(as(stranger.token))
      .expect(404);
    await move(applicationId, { stage: 'screening' }, stranger.token).expect(404);

    // An HR officer who looks after My Group Foods only does not see Textiles' openings.
    const foods = await kit.staff('hr_officer', ['MGF']);
    await api(app)
      .get(`/tenant/recruitment/openings/${opening.id}/pipeline`)
      .set(as(foods.token))
      .expect(404);
    await api(app)
      .get(`/tenant/recruitment/applications/${applicationId}`)
      .set(as(foods.token))
      .expect(404);
    await api(app)
      .get(`/tenant/recruitment/candidates/${candidateId}`)
      .set(as(foods.token))
      .expect(404);
    const listed = (
      await api(app)
        .get(`/tenant/recruitment/candidates?openingId=${opening.id}`)
        .set(as(foods.token))
        .expect(200)
    ).body as Page<CandidateListItem>;
    expect(listed.items).toEqual([]);
    await kit.add(opening.id, {}, undefined, foods.token).expect(404);
    const theirs = await kit.opening({ company: 'MGF' });
    const inFoods = await kit.add(theirs.id, {}, undefined, foods.token).expect(201);
    await move(inFoods.body.applicationId, { stage: 'screening' }, foods.token).expect(200);
  });

  it('tells a rejected candidate in their language, when asked to', async () => {
    const opening = await kit.opening({ postTitleBn: 'সেলাই মেশিন অপারেটর' });
    const bnEmail = `bn-${kit.unique()}@example.com`;
    const bn = await kit.added(opening.id, {
      email: bnEmail,
      fullName: 'Shapla Akter',
      language: 'bn',
    });
    const done = (
      await move(bn.applicationId, {
        stage: 'rejected',
        reason: 'Position filled internally',
        emailCandidate: true,
      }).expect(200)
    ).body as ApplicationDetail;
    const [bangla] = kit.sentTo(bnEmail);
    expect(bangla!.subject).toContain('সেলাই মেশিন অপারেটর');
    expect(bangla!.text).toContain('প্রিয় Shapla Akter');
    // The reason is HR's, not the candidate's to read.
    expect(bangla!.text).not.toContain('Position filled internally');
    expect(done.events.at(-1)).toMatchObject({ kind: 'email', note: 'rejection' });

    const enEmail = `en-${kit.unique()}@example.com`;
    const en = await kit.added(opening.id, { email: enEmail, fullName: 'Rafiq Islam' });
    await move(en.applicationId, {
      stage: 'rejected',
      reason: 'Too far',
      emailCandidate: true,
    }).expect(200);
    expect(kit.sentTo(enEmail)).toEqual([
      expect.objectContaining({
        subject: `Your application for ${opening.postTitleEn} at My Group`,
        text: expect.stringContaining('Dear Rafiq Islam'),
      }),
    ]);

    const quietEmail = `quiet-${kit.unique()}@example.com`;
    const quiet = await kit.added(opening.id, { email: quietEmail });
    await move(quiet.applicationId, { stage: 'rejected', reason: 'Too far' }).expect(200);
    expect(kit.sentTo(quietEmail)).toEqual([]);
  });

  it('erases a candidate on request: the person, their CV, notes and feedback, but not ratings', async () => {
    const store = app.get<FileStore>(FILE_STORE);
    const interviewer = await kit.person();
    const opening = await kit.opening();
    const cv = await pdfCv(['Mohammad Rana']);
    const { candidateId, applicationId } = await kit.added(
      opening.id,
      { coverNote: 'I live near the factory', notes: 'Prefers the night shift' },
      cv,
    );
    await api(app)
      .post(`/tenant/recruitment/applications/${applicationId}/notes`)
      .set(as())
      .send({ note: 'His uncle works on line 3' })
      .expect(201);
    const interview = await schedule(applicationId, [interviewer.employee.id]);
    await api(app)
      .put(`/tenant/interviews/${interview.id}/scorecard`)
      .set(as(interviewer.token))
      .send({
        ratings: {
          'Skills for the job': 4,
          Experience: 3,
          Communication: 4,
          'Attitude and teamwork': 5,
        },
        recommendation: 'yes',
        feedback: 'Talked about his family in Rangpur',
      })
      .expect(200);
    const [stored] = await kit.inTenant((tx) =>
      tx
        .select({ key: candidates.cvStorageKey })
        .from(candidates)
        .where(eq(candidates.id, candidateId)),
    );
    expect(await store.get(stored!.key!)).toBeInstanceOf(Buffer);

    const erased = (
      await api(app)
        .post(`/tenant/recruitment/candidates/${candidateId}/erase`)
        .set(as())
        .expect(200)
    ).body as CandidateDetail;
    expect(erased).toMatchObject({
      fullName: 'Erased candidate',
      email: null,
      phone: null,
      notes: null,
      cv: null,
      talentPool: false,
    });
    expect(erased.erasedAt).not.toBeNull();
    await expect(store.get(stored!.key!)).rejects.toThrow();

    const after = await detail(applicationId);
    expect(after).toMatchObject({
      stage: 'withdrawn',
      coverNote: null,
      candidate: { fullName: 'Erased candidate', erased: true, cv: null },
    });
    expect(after.events.find((e) => e.kind === 'note')!.note).toBeNull();
    expect(after.interviews[0]!.status).toBe('cancelled');
    const [panel] = await kit.inTenant((tx) =>
      tx.select().from(interviewPanel).where(eq(interviewPanel.interviewId, interview.id)),
    );
    expect(panel).toMatchObject({ feedback: null, recommendation: 'yes' });
    expect(panel!.ratings).toMatchObject({ Experience: 3 });
    await api(app)
      .get(`/tenant/recruitment/applications/${applicationId}/cv`)
      .set(as())
      .expect(404);
    const audit = await kit.inTenant((tx) =>
      tx
        .select()
        .from(tenantAuditLog)
        .where(
          and(
            eq(tenantAuditLog.entityId, candidateId),
            eq(tenantAuditLog.action, 'candidate.erase'),
          ),
        ),
    );
    expect(audit).toHaveLength(1);
    // Asking again changes nothing.
    await api(app)
      .post(`/tenant/recruitment/candidates/${candidateId}/erase`)
      .set(as())
      .expect(200);

    const hired = await kit.added(opening.id);
    await kit.inTenant((tx) =>
      tx
        .update(applications)
        .set({ stage: 'hired' })
        .where(eq(applications.id, hired.applicationId)),
    );
    const refused = await api(app)
      .post(`/tenant/recruitment/candidates/${hired.candidateId}/erase`)
      .set(as())
      .expect(409);
    expect(refused.body.code).toBe('candidate_hired');
  });

  it('erases, once a day, only candidates whose time is up', async () => {
    const jobs = app.get(CandidateRetentionJobs);
    const old = sql`now() - interval '14 months'`;
    const opening = await kit.opening();
    const ended = await kit.opening();
    const another = await kit.opening();
    const rejected = (fields: Record<string, string> = {}) =>
      kit.added(opening.id, fields).then(async (c) => {
        await move(c.applicationId, { stage: 'rejected', reason: 'Not suitable' }).expect(200);
        return c;
      });
    const expired = await rejected();
    const pooled = await rejected({ talentPool: 'true' });
    const recent = await rejected();
    const hired = await kit.added(opening.id);
    const inProgress = await kit.added(opening.id);
    const closedUnder = await kit.added(ended.id);
    // Someone whose other application is still going is kept.
    const phone = kit.mobile();
    const twoJobs = await rejected({ phone });
    await kit.added(another.id, { phone, email: '' });

    const backdated = [expired, pooled, hired, inProgress, closedUnder, twoJobs];
    const ids = backdated.map((c) => c.candidateId);
    await kit.inTenant(async (tx) => {
      await tx
        .update(applications)
        .set({ stage: 'hired' })
        .where(eq(applications.id, hired.applicationId));
      await tx
        .update(jobOpenings)
        .set({ status: 'closed', closedAt: old, updatedAt: old })
        .where(eq(jobOpenings.id, ended.id));
      await tx.update(candidates).set({ updatedAt: old }).where(inArray(candidates.id, ids));
      await tx
        .update(applications)
        .set({ updatedAt: old, stageChangedAt: old, appliedAt: old })
        .where(inArray(applications.candidateId, ids));
      await tx
        .update(applicationEvents)
        .set({ createdAt: old })
        .where(
          inArray(
            applicationEvents.applicationId,
            tx
              .select({ id: applications.id })
              .from(applications)
              .where(inArray(applications.candidateId, ids)),
          ),
        );
    });

    const erasedNow = () =>
      kit
        .inTenant((tx) =>
          tx
            .select({ id: candidates.id, erasedAt: candidates.erasedAt })
            .from(candidates)
            .where(inArray(candidates.id, [...ids, recent.candidateId])),
        )
        .then((rows) =>
          rows
            .filter((r) => r.erasedAt)
            .map((r) => r.id)
            .toSorted(),
        );

    const first = await runInTenantContext(kit.tenantId, () => jobs.eraseExpired());
    expect(first).toBeGreaterThanOrEqual(2);
    expect(await erasedNow()).toEqual([expired.candidateId, closedUnder.candidateId].toSorted());
    expect((await candidate(expired.candidateId)).fullName).toBe('Erased candidate');

    // Running again changes nothing; the seeded candidates, whose applications are open, stay.
    await runInTenantContext(kit.tenantId, () => jobs.eraseExpired());
    expect(await erasedNow()).toEqual([expired.candidateId, closedUnder.candidateId].toSorted());
    const seeded = await kit.inTenant((tx) =>
      tx
        .select({ erasedAt: candidates.erasedAt })
        .from(candidates)
        .where(eq(candidates.phone, '+8801711000101')),
    );
    expect(seeded).toHaveLength(1);
    expect(seeded.every((c) => c.erasedAt === null)).toBe(true);

    // A year later, everyone not kept for good goes too.
    const later = new Date(Date.now() + 13 * 30 * 86_400_000);
    await runInTenantContext(kit.tenantId, () => jobs.eraseExpired(later));
    const kept = await kit.inTenant((tx) =>
      tx
        .select({ id: candidates.id, erasedAt: candidates.erasedAt })
        .from(candidates)
        .where(inArray(candidates.id, [pooled.candidateId, hired.candidateId, recent.candidateId])),
    );
    expect(Object.fromEntries(kept.map((k) => [k.id, k.erasedAt !== null]))).toEqual({
      [pooled.candidateId]: false,
      [hired.candidateId]: false,
      [recent.candidateId]: true,
    });
  });

  const download = (path: string, token: string, status: number) =>
    binary(api(app).get(path).set(as(token))).expect(status);

  it('gives the CV to HR, the hiring manager and the interviewers only', async () => {
    const manager = await kit.person();
    const interviewer = await kit.person();
    const stranger = await kit.person();
    const opening = await kit.opening({ hiringManagerEmployeeId: manager.employee.id });
    const cv = await pdfCv(['Taslima Khatun', 'Mobile: 01911000103']);
    const { applicationId, candidateId } = await kit.added(opening.id, {}, cv);
    await schedule(applicationId, [interviewer.employee.id]);

    for (const token of [kit.admin, manager.token, interviewer.token]) {
      const res = await download(
        `/tenant/recruitment/applications/${applicationId}/cv`,
        token,
        200,
      );
      expect(Buffer.compare(res.body as Buffer, cv)).toBe(0);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
    }
    await download(`/tenant/recruitment/applications/${applicationId}/cv`, stranger.token, 404);
    await download(`/tenant/recruitment/candidates/${candidateId}/cv`, kit.admin, 200);
    await download(`/tenant/recruitment/candidates/${candidateId}/cv`, manager.token, 403);
    await download(`/tenant/recruitment/candidates/${candidateId}/cv`, interviewer.token, 403);
  });

  it('tells each login what they have to do with recruitment', async () => {
    const manager = await kit.person();
    const interviewer = await kit.person();
    const nobody = await kit.person();
    const opening = await kit.opening({ hiringManagerEmployeeId: manager.employee.id });
    const { applicationId } = await kit.added(opening.id);
    await schedule(applicationId, [interviewer.employee.id]);
    const me = async (token: string) =>
      (await api(app).get('/tenant/recruitment/me').set(as(token)).expect(200))
        .body as RecruitmentMe;
    expect((await me(kit.admin)).manage).toBe(true);
    expect(await me(manager.token)).toEqual({ manage: false, hiringManager: true, interviews: 0 });
    expect(await me(interviewer.token)).toEqual({
      manage: false,
      hiringManager: false,
      interviews: 1,
    });
    expect(await me(nobody.token)).toEqual({ manage: false, hiringManager: false, interviews: 0 });
    // A closed opening no longer makes its manager a hiring manager.
    await kit.inTenant((tx) =>
      tx.update(jobOpenings).set({ status: 'closed' }).where(eq(jobOpenings.id, opening.id)),
    );
    expect((await me(manager.token)).hiringManager).toBe(false);
    // The interviewer's view of it names no contact details.
    const mine = (await api(app).get('/tenant/interviews').set(as(interviewer.token)).expect(200))
      .body.upcoming as { id: string }[];
    const view = (
      await api(app).get(`/tenant/interviews/${mine[0]!.id}`).set(as(interviewer.token)).expect(200)
    ).body as MyInterviewDetail;
    expect(JSON.stringify(view)).not.toContain('@example.com');
  });

  it('reads the name, email and mobile number from a CV for HR to check', async () => {
    const parse = (bytes: Buffer, name: string, token = kit.admin) =>
      api(app).post('/tenant/recruitment/cv/parse').set(as(token)).attach('cv', bytes, name);
    const cv = await pdfCv([
      'CURRICULUM VITAE',
      'MD. ABDUR RAHIM',
      'Email: abdur.rahim@example.com',
      'Mobile: +880 1812-345678',
    ]);
    expect((await parse(cv, 'rahim.pdf').expect(200)).body as CvContacts).toEqual({
      fullName: 'Md. Abdur Rahim',
      email: 'abdur.rahim@example.com',
      phone: '01812345678',
      legacyBangla: false,
    });
    expect((await parse(Buffer.from('plain text'), 'cv.txt').expect(415)).body.code).toBe(
      'cv_type',
    );
    expect(
      (await api(app).post('/tenant/recruitment/cv/parse').set(as()).expect(400)).body.code,
    ).toBe('cv_missing');
    const employee = await kit.person();
    await parse(cv, 'rahim.pdf', employee.token).expect(403);
  });
});
