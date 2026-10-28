import { createHash, randomBytes } from 'node:crypto';
import {
  applicationEvents,
  applications,
  candidates,
  createDb,
  employees,
  jobAssignments,
  jobOpenings,
  notifications,
  offers,
  runAsTenant,
  tenants,
  type FieldCipher,
} from '@gp/db';
import {
  addDays,
  addMonths,
  todayIn,
  type ApplicationOffers,
  type ApprovalItem,
  type DocumentView,
  type OfferApprovalItem,
  type OfferHirePrefill,
  type OfferHireResult,
  type OfferView,
  type PublicOfferView,
  type WorkspaceUserCreated,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';
import { runInTenantContext } from '../src/common/request-context.js';
import { FIELD_CIPHER } from '../src/db/db.module.js';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type LogSender,
} from '../src/modules/notifications/senders.js';
import { OfferJobs } from '../src/modules/offers/offer-jobs.service.js';
import { storeCv } from '../src/modules/recruitment/intake.js';
import type { FileStore } from '../src/storage/file-store.js';
import { FILE_STORE } from '../src/storage/storage.module.js';
import { binary, isPdf, payrollKit } from './payroll-helpers.js';
import { api, bearer, bootApp, testEnv } from './test-env.js';

const BASE = '/tenant/recruitment/offers';
const PDF = Buffer.from('%PDF-1.4\n% a CV\n%%EOF\n');
const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;
const page = (token: string, slug = 'my-group') => `/offers/${slug}/${token}`;

// Each test makes its own opening, candidate and application in the seeded my-group workspace
// (straight into the database, as openings and the pipeline are other areas'), so the tests
// pass in any order. Offers expire well after today except where a test is about expiry.
describe('offers', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof payrollKit>>;
  let db: ReturnType<typeof createDb>['db'];
  let pool: ReturnType<typeof createDb>['pool'];
  let tenantId: string;
  let otherSlug: string;
  let email: LogSender<EmailMessage>;
  let jobs: OfferJobs;
  let files: { store: FileStore; cipher: FieldCipher };
  let manager: string;
  let seq = 0;
  const today = todayIn();
  const later = (days: number) => addDays(today, days);

  beforeAll(async () => {
    app = await bootApp();
    kit = await payrollKit(app);
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    tenantId = tenant!.id;
    const [other] = await db.select().from(tenants).where(ne(tenants.slug, 'my-group')).limit(1);
    otherSlug = other!.slug;
    email = app.get(EMAIL_SENDER);
    jobs = app.get(OfferJobs);
    files = { store: app.get(FILE_STORE), cipher: app.get(FIELD_CIPHER) };
    const [mg4] = await asTenant((tx) =>
      tx.select().from(employees).where(eq(employees.employeeCode, 'MG-0004')),
    );
    manager = mg4!.id;
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  const asTenant = <T>(fn: Parameters<typeof runAsTenant<T>>[2]) => runAsTenant(db, tenantId, fn);
  const entity = (code: 'MGT' | 'MGF') => ref(kit.org.legalEntities, code);

  async function login(role: string, companies?: ('MGT' | 'MGF')[]) {
    const loginEmail = `offers-${kit.unique().toLowerCase()}@example.test`;
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(kit.admin))
        .send({ name: `Offers ${role}`, email: loginEmail, role, password: testEnv().password })
        .expect(201)
    ).body as WorkspaceUserCreated;
    if (companies) {
      await api(app)
        .put(`/tenant/users/${user.id}/scopes`)
        .set(bearer(kit.admin))
        .send({ legalEntityIds: companies.map(entity) })
        .expect(200);
    }
    const token = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: 'my-group', email: loginEmail, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;
    return { id: user.id, token };
  }

  /** An open opening, a candidate and their application at the interview stage. */
  async function application(
    options: {
      company?: 'MGT' | 'MGF';
      headcount?: number;
      budgetMax?: string | null;
      cv?: boolean;
      language?: 'en' | 'bn';
      stage?: 'interview' | 'rejected';
    } = {},
  ) {
    const { company = 'MGT', headcount = 1, cv = false, language = 'en' } = options;
    const n = kit.unique();
    return asTenant(async (tx) => {
      const [opening] = await tx
        .insert(jobOpenings)
        .values({
          tenantId,
          legalEntityId: entity(company),
          ...(company === 'MGT'
            ? {
                orgUnitId: ref(kit.org.orgUnits, 'MGT-L1'),
                locationId: ref(kit.org.locations, 'GZP'),
              }
            : {}),
          designationId: ref(kit.org.designations, 'SO'),
          gradeId: ref(kit.org.grades, 'W5'),
          title: `Sewing operator ${n}`,
          employmentType: 'probationer',
          headcount,
          budgetMin: '12500',
          budgetMax: options.budgetMax === undefined ? '14000' : options.budgetMax,
          hiringManagerEmployeeId: manager,
          status: 'open',
        })
        .returning();
      const [candidate] = await tx
        .insert(candidates)
        .values({
          tenantId,
          fullName: 'Ayesha Siddika',
          email: `ayesha-${n.toLowerCase()}@example.test`,
          phone: `+88017${String(Date.now()).slice(-8)}`,
          source: 'careers_page',
          language,
          consentAt: new Date(),
        })
        .returning();
      if (cv) {
        const columns = await storeCv(
          files,
          tenantId,
          candidate!.id,
          { bytes: PDF, fileName: 'ayesha-cv.pdf' },
          'application/pdf',
        );
        await tx.update(candidates).set(columns).where(eq(candidates.id, candidate!.id));
      }
      const [row] = await tx
        .insert(applications)
        .values({
          tenantId,
          openingId: opening!.id,
          candidateId: candidate!.id,
          stage: options.stage ?? 'interview',
          source: 'careers_page',
        })
        .returning();
      return { id: row!.id, opening: opening!, candidate: candidate! };
    });
  }
  type Application = Awaited<ReturnType<typeof application>>;

  const terms = (a: Application, overrides: Record<string, unknown> = {}) => ({
    applicationId: a.id,
    legalEntityId: a.opening.legalEntityId,
    orgUnitId: a.opening.orgUnitId,
    locationId: a.opening.locationId,
    designationId: a.opening.designationId,
    gradeId: a.opening.gradeId,
    employmentType: 'probationer',
    joiningOn: later(20),
    monthlyGross: '13000',
    expiresOn: later(10),
    language: 'en',
    terms: 'Lunch, transport and a festival bonus as the Act requires.',
    ...overrides,
  });
  const draft = (a: Application, overrides: Record<string, unknown> = {}, token = kit.admin) =>
    api(app).post(BASE).set(bearer(token)).send(terms(a, overrides));
  const act = (id: string, action: 'submit' | 'send' | 'withdraw', token = kit.admin) =>
    api(app).post(`${BASE}/${id}/${action}`).set(bearer(token));
  const get = async (id: string, token = kit.admin) =>
    (await api(app).get(`${BASE}/${id}`).set(bearer(token)).expect(200)).body as OfferView;

  /** The link in the last offer email to this address. */
  function linkFor(to: string) {
    const message = email.sent.findLast((m) => m.to === to && m.text.includes('/offers/'));
    return message?.text.match(/\/offers\/my-group\/([A-Za-z0-9_-]{43})/)?.[1];
  }

  /** An application with an offer within budget, sent; returns the candidate's token. */
  async function sent(options: Parameters<typeof application>[0] = {}, overrides = {}) {
    const a = await application(options);
    const offer = (await draft(a, overrides).expect(201)).body as OfferView;
    await act(offer.id, 'submit').expect(200);
    await act(offer.id, 'send').expect(200);
    return { a, offer, token: linkFor(a.candidate.email!)! };
  }

  const accept = (token: string, name = 'Ayesha Siddika') =>
    api(app)
      .post(`${page(token)}/accept`)
      .send({ name });

  async function accepted(options: Parameters<typeof application>[0] = {}) {
    const offer = await sent(options);
    await accept(offer.token).expect(200);
    return offer;
  }

  const hireBody = (overrides: Record<string, unknown> = {}) => ({
    employeeCode: `OF-${kit.unique()}`,
    fatherName: 'Abdul Karim',
    motherName: 'Hosne Ara',
    dateOfBirth: '1998-02-14',
    gender: 'female',
    religion: 'islam',
    presentAddress: address,
    permanentAddress: address,
    identity: { nid: `${Date.now()}${seq++}`.slice(-10) },
    ...overrides,
  });

  const events = (applicationId: string) =>
    asTenant((tx) =>
      tx.select().from(applicationEvents).where(eq(applicationEvents.applicationId, applicationId)),
    );
  const row = async (id: string) =>
    (await asTenant((tx) => tx.select().from(offers).where(eq(offers.id, id))))[0]!;

  it('drafts an offer from the opening and sends one within the budget straight away', async () => {
    const a = await application();
    const before = (
      await api(app).get(`${BASE}?applicationId=${a.id}`).set(bearer(kit.admin)).expect(200)
    ).body as ApplicationOffers;
    expect(before).toMatchObject({
      canOffer: true,
      offers: [],
      budgetMax: '14000.00',
      probation: { clerical: 6, other: 3 },
      defaults: {
        legalEntityId: entity('MGT'),
        designationId: a.opening.designationId,
        employmentType: 'probationer',
        language: 'en',
      },
    });

    const created = (await draft(a).expect(201)).body as OfferView;
    // A sewing operator's probation is the Act's three months for work other than clerical.
    expect(created).toMatchObject({ status: 'draft', probationMonths: 3, aboveBudget: false });
    const [moved] = await asTenant((tx) =>
      tx.select().from(applications).where(eq(applications.id, a.id)),
    );
    expect(moved!.stage).toBe('offer');
    expect((await events(a.id)).map((e) => [e.kind, e.toStage ?? e.note])).toEqual(
      expect.arrayContaining([
        ['stage', 'offer'],
        ['offer', 'draft'],
      ]),
    );

    const submitted = (await act(created.id, 'submit').expect(200)).body as OfferView;
    expect(submitted).toMatchObject({ status: 'approved', steps: [] });
    const out = (await act(created.id, 'send').expect(200)).body as OfferView;
    expect(out.status).toBe('sent');
    expect(out.sentAt).not.toBeNull();

    const token = linkFor(a.candidate.email!)!;
    expect(token).toBeDefined();
    expect((await row(created.id)).tokenHash).toBe(sha256(Buffer.from(token)));
    const view = (await api(app).get(page(token)).expect(200)).body as PublicOfferView;
    expect(view).toMatchObject({
      status: 'sent',
      candidate: { fullName: 'Ayesha Siddika' },
      monthlyGross: '13000.00',
      probationMonths: 3,
      joiningOn: later(20),
      expiresOn: later(10),
      workspace: { slug: 'my-group' },
    });
    expect(view).not.toHaveProperty('acceptedIp');

    const wrong = randomBytes(32).toString('base64url');
    await api(app).get(page(wrong)).expect(404);
    await api(app).get(page('not-a-token')).expect(404);
    await api(app).get(page(token, otherSlug)).expect(404);
  });

  it('keeps one live offer per application, and none for a closed one', async () => {
    const a = await application();
    const first = (await draft(a).expect(201)).body as OfferView;
    const again = await draft(a).expect(409);
    expect(again.body.code).toBe('offer_exists');
    await act(first.id, 'withdraw').expect(200);
    await draft(a).expect(201);

    const closed = await application({ stage: 'rejected' });
    expect((await draft(closed).expect(409)).body.code).toBe('application_closed');
  });

  it('checks the terms: expiry, probation and the company of the unit', async () => {
    const a = await application();
    const past = await draft(a, { expiresOn: addDays(today, -1), joiningOn: later(5) }).expect(400);
    expect(past.body.code).toBe('offer_expiry_past');
    const afterJoining = await draft(a, { expiresOn: later(30) }).expect(400);
    expect(afterJoining.body.issues[0].path).toBe('expiresOn');
    const long = await draft(a, { probationMonths: 6 }).expect(400);
    expect(long.body.code).toBe('probation_too_long');
    const elsewhere = await draft(a, {
      orgUnitId: ref(kit.org.orgUnits, 'MGF-PROD'),
    }).expect(400);
    expect(elsewhere.body.code).toBe('unit_other_company');
    const permanent = (
      await draft(a, { employmentType: 'permanent', probationMonths: 2 }).expect(201)
    ).body as OfferView;
    expect(permanent.probationMonths).toBeNull();
  });

  it('sends an offer above the budget only once another HR login approves it', async () => {
    const officer = await login('hr_officer');
    const a = await application();
    const offer = (await draft(a, { monthlyGross: '15000' }).expect(201)).body as OfferView;
    const pending = (await act(offer.id, 'submit').expect(200)).body as OfferView;
    expect(pending).toMatchObject({ status: 'pending_approval', aboveBudget: true });
    expect(pending.steps).toMatchObject([{ kind: 'hr', status: 'pending' }]);
    expect((await act(offer.id, 'send').expect(409)).body.code).toBe('offer_not_approved');

    // The maker may not approve their own offer, nor see it waiting for them.
    const stepId = pending.steps[0]!.id;
    const own = await api(app)
      .post(`/tenant/approvals/${stepId}/approve`)
      .set(bearer(kit.admin))
      .send({})
      .expect(403);
    expect(own.body.code).toBe('own_change');
    const mine = (await api(app).get('/tenant/approvals').set(bearer(kit.admin)).expect(200))
      .body as ApprovalItem[];
    expect(mine.some((i) => i.subjectType === 'offer' && i.offer.id === offer.id)).toBe(false);

    const inbox = (await api(app).get('/tenant/approvals').set(bearer(officer.token)).expect(200))
      .body as ApprovalItem[];
    const item = inbox.find(
      (i): i is OfferApprovalItem => i.subjectType === 'offer' && i.offer.id === offer.id,
    );
    expect(item).toMatchObject({ kind: 'hr', offer: { monthlyGross: '15000.00' } });
    await api(app)
      .post(`/tenant/approvals/${item!.stepId}/approve`)
      .set(bearer(officer.token))
      .send({})
      .expect(201);
    expect((await get(offer.id)).status).toBe('approved');
    await act(offer.id, 'send').expect(200);
    expect(linkFor(a.candidate.email!)).toBeDefined();
  });

  it('takes a rejected offer back to draft when its terms change', async () => {
    const officer = await login('hr_officer');
    const a = await application();
    const offer = (await draft(a, { monthlyGross: '16000' }).expect(201)).body as OfferView;
    const pending = (await act(offer.id, 'submit').expect(200)).body as OfferView;
    await api(app)
      .post(`/tenant/approvals/${pending.steps[0]!.id}/reject`)
      .set(bearer(officer.token))
      .send({ comment: 'Above the line rate' })
      .expect(201);
    expect((await get(offer.id)).status).toBe('rejected');
    const changed = (
      await api(app)
        .patch(`${BASE}/${offer.id}`)
        .set(bearer(kit.admin))
        .send({ ...terms(a, { monthlyGross: '13500' }), applicationId: undefined })
        .expect(200)
    ).body as OfferView;
    expect(changed).toMatchObject({ status: 'draft', monthlyGross: '13500.00' });
    expect((await act(offer.id, 'submit').expect(200)).body.status).toBe('approved');
  });

  it('renders the letter in English and in Bangla', async () => {
    for (const language of ['en', 'bn'] as const) {
      const a = await application({ language });
      const offer = (await draft(a, { language }).expect(201)).body as OfferView;
      const res = await binary(
        api(app).get(`${BASE}/${offer.id}/letter`).set(bearer(kit.admin)),
      ).expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(isPdf(res.body as Buffer)).toBe(true);
    }
  });

  it('records the acceptance with the name typed and keeps the letter as accepted', async () => {
    const { a, offer, token } = await sent();
    const wrong = await accept(token, 'Ayesha Begum').expect(400);
    expect(wrong.body.code).toBe('name_mismatch');

    const view = (await accept(token, '  ayesha   SIDDIKA ').expect(200)).body as PublicOfferView;
    expect(view).toMatchObject({ status: 'accepted', acceptedName: 'ayesha   SIDDIKA' });
    const kept = await row(offer.id);
    expect(kept).toMatchObject({ status: 'accepted', acceptedName: 'ayesha   SIDDIKA' });
    expect(kept.acceptedIp).toBeTruthy();
    expect(kept.decidedAt).not.toBeNull();

    // The stored letter's bytes are the ones fingerprinted, for HR and for the candidate.
    const letter = await binary(
      api(app).get(`${BASE}/${offer.id}/letter`).set(bearer(kit.admin)),
    ).expect(200);
    expect(sha256(letter.body as Buffer)).toBe(kept.letterSha256);
    const theirs = await binary(api(app).get(`${page(token)}/letter`)).expect(200);
    expect(sha256(theirs.body as Buffer)).toBe(kept.letterSha256);

    const confirmation = email.sent.findLast(
      (m) => m.to === a.candidate.email && (m.attachments?.length ?? 0) > 0,
    );
    expect(confirmation?.subject).toContain('accepted');
    const attached = confirmation!.attachments![0]!;
    expect(attached.contentType).toBe('application/pdf');
    expect(sha256(attached.content)).toBe(kept.letterSha256);

    const told = await asTenant((tx) =>
      tx
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.event, 'recruitment.offer'),
            sql`${notifications.data}->>'offerId' = ${offer.id}`,
          ),
        ),
    );
    expect(told.length).toBeGreaterThan(0);
    expect(told.some((n) => n.title.includes('accepted'))).toBe(true);
    const event = (await events(a.id)).find((e) => e.kind === 'offer' && e.note === 'accepted');
    expect(event?.actorUserId).toBeNull();

    expect((await accept(token).expect(409)).body.code).toBe('offer_decided');
  });

  it('records a decline with its reason', async () => {
    const { a, offer, token } = await sent();
    const view = (
      await api(app)
        .post(`${page(token)}/decline`)
        .send({ reason: 'I took a job nearer home' })
        .expect(200)
    ).body as PublicOfferView;
    expect(view.status).toBe('declined');
    expect((await row(offer.id)).declineReason).toBe('I took a job nearer home');
    const told = await asTenant((tx) =>
      tx
        .select()
        .from(notifications)
        .where(sql`${notifications.data}->>'offerId' = ${offer.id}`),
    );
    expect(told.some((n) => n.title.includes('declined') && n.body.includes('nearer home'))).toBe(
      true,
    );
    expect((await events(a.id)).some((e) => e.note === 'declined')).toBe(true);
    expect((await accept(token).expect(409)).body.code).toBe('offer_decided');
  });

  it('refuses an answer after the last day, and the daily job marks the offer expired', async () => {
    const { a, offer, token } = await sent({}, { expiresOn: today });
    await asTenant((tx) =>
      tx
        .update(offers)
        .set({ expiresOn: addDays(today, -1) })
        .where(eq(offers.id, offer.id)),
    );
    expect(((await api(app).get(page(token)).expect(200)).body as PublicOfferView).status).toBe(
      'expired',
    );
    expect((await accept(token).expect(409)).body.code).toBe('offer_expired');

    const expired = await runInTenantContext(tenantId, () => jobs.expireTenant());
    expect(expired).toBeGreaterThanOrEqual(1);
    expect((await row(offer.id)).status).toBe('expired');
    expect((await events(a.id)).some((e) => e.note === 'expired')).toBe(true);
    const decline = await api(app)
      .post(`${page(token)}/decline`)
      .send({})
      .expect(409);
    expect(decline.body.code).toBe('offer_expired');
  });

  it('withdraws a sent offer, which closes the link', async () => {
    const { offer, token } = await sent();
    expect(((await act(offer.id, 'withdraw').expect(200)).body as OfferView).status).toBe(
      'withdrawn',
    );
    expect(((await api(app).get(page(token)).expect(200)).body as PublicOfferView).status).toBe(
      'withdrawn',
    );
    expect((await accept(token).expect(409)).body.code).toBe('offer_withdrawn');
    expect((await act(offer.id, 'withdraw').expect(409)).body.code).toBe('offer_not_withdrawable');
  });

  it('hires the candidate from the accepted offer, with their documents and pay', async () => {
    const group = await kit.group();
    const { a, offer } = await accepted({ cv: true });
    const prefill = (
      await api(app).get(`${BASE}/${offer.id}/hire`).set(bearer(kit.admin)).expect(200)
    ).body as OfferHirePrefill;
    const probationEndsOn = addDays(addMonths(later(20), 3), -1);
    expect(prefill).toMatchObject({
      email: a.candidate.email,
      mobilePhone: a.candidate.phone!.replace('+88', ''),
      workerCategory: 'worker',
      probationEndsOn,
    });
    expect(prefill.payroll?.structures.map((s) => s.code)).toContain('RMG_WORKER');

    const result = (
      await api(app)
        .post(`${BASE}/${offer.id}/hire`)
        .set(bearer(kit.admin))
        .send(
          hireBody({
            pay: {
              structureId: kit.structure('RMG_WORKER').id,
              payGroupId: group.id,
              wageGrade: 'G5',
            },
          }),
        )
        .expect(201)
    ).body as OfferHireResult;
    const employeeId = result.employee.id;
    expect(result.employee).toMatchObject({
      fullName: 'Ayesha Siddika',
      joinedOn: later(20),
      probationEndsOn,
      mobilePhone: a.candidate.phone,
      personalEmail: a.candidate.email,
    });
    expect(result.payNote).toBeNull();
    expect(result.pay).toMatchObject({ effectiveFrom: later(20) });
    expect(['pending', 'approved']).toContain(result.pay!.status);

    const [job] = await asTenant((tx) =>
      tx.select().from(jobAssignments).where(eq(jobAssignments.employeeId, employeeId)),
    );
    expect(job).toMatchObject({
      legalEntityId: entity('MGT'),
      designationId: a.opening.designationId,
      employmentType: 'probationer',
      effectiveFrom: later(20),
      event: 'hire',
    });
    const [hiredApplication] = await asTenant((tx) =>
      tx.select().from(applications).where(eq(applications.id, a.id)),
    );
    expect(hiredApplication).toMatchObject({ stage: 'hired', employeeId });
    expect((await events(a.id)).some((e) => e.toStage === 'hired')).toBe(true);

    const docs = (
      await api(app)
        .get(`/tenant/employees/${employeeId}/documents`)
        .set(bearer(kit.admin))
        .expect(200)
    ).body as DocumentView[];
    expect(docs.map((d) => [d.category, d.title]).toSorted()).toEqual([
      ['contract', 'Accepted offer'],
      ['other', 'CV'],
    ]);
    const [opening] = await asTenant((tx) =>
      tx.select().from(jobOpenings).where(eq(jobOpenings.id, a.opening.id)),
    );
    expect(opening!.status).toBe('filled');
    expect(opening!.closedAt).not.toBeNull();

    const again = await api(app)
      .post(`${BASE}/${offer.id}/hire`)
      .set(bearer(kit.admin))
      .send(hireBody())
      .expect(409);
    expect(again.body.code).toBe('already_hired');
  });

  it('refuses hiring before acceptance, by a login without employees.write, or under age', async () => {
    const waiting = await sent();
    const early = await api(app)
      .post(`${BASE}/${waiting.offer.id}/hire`)
      .set(bearer(kit.admin))
      .send(hireBody())
      .expect(409);
    expect(early.body.code).toBe('offer_not_accepted');

    const { a, offer } = await accepted({ headcount: 2 });
    const payroll = await login('payroll_officer');
    await api(app)
      .post(`${BASE}/${offer.id}/hire`)
      .set(bearer(payroll.token))
      .send(hireBody())
      .expect(403);
    // Thirteen on the joining date: under the Act's minimum age (s.34).
    const young = await api(app)
      .post(`${BASE}/${offer.id}/hire`)
      .set(bearer(kit.admin))
      .send(hireBody({ dateOfBirth: addMonths(later(20), -13 * 12) }))
      .expect(400);
    expect(young.body.issues.map((i: { path: string }) => i.path)).toContain('dateOfBirth');

    // Without a structure, the hire stands and pay is left for HR to set.
    const result = (
      await api(app)
        .post(`${BASE}/${offer.id}/hire`)
        .set(bearer(kit.admin))
        .send(hireBody())
        .expect(201)
    ).body as OfferHireResult;
    expect(result).toMatchObject({ pay: null, payNote: { code: 'pay_not_chosen' } });
    const [opening] = await asTenant((tx) =>
      tx.select().from(jobOpenings).where(eq(jobOpenings.id, a.opening.id)),
    );
    expect(opening!.status).toBe('open');
  });

  it("keeps a login limited to other companies away from this company's offers", async () => {
    const foods = await login('hr_officer', ['MGF']);
    const a = await application();
    const offer = (await draft(a, { monthlyGross: '15500' }).expect(201)).body as OfferView;
    const pending = (await act(offer.id, 'submit').expect(200)).body as OfferView;

    await api(app).get(`${BASE}/${offer.id}`).set(bearer(foods.token)).expect(404);
    await api(app).get(`${BASE}?applicationId=${a.id}`).set(bearer(foods.token)).expect(404);
    await draft(a, {}, foods.token).expect(404);
    const inbox = (await api(app).get('/tenant/approvals').set(bearer(foods.token)).expect(200))
      .body as ApprovalItem[];
    expect(inbox.some((i) => i.subjectType === 'offer' && i.offer.id === offer.id)).toBe(false);
    const decide = await api(app)
      .post(`/tenant/approvals/${pending.steps[0]!.id}/approve`)
      .set(bearer(foods.token))
      .send({})
      .expect(403);
    expect(decide.body.code).toBe('outside_scope');
    expect((await get(offer.id)).status).toBe('pending_approval');

    // In their own company they draft, but not into one they do not look after.
    const own = await application({ company: 'MGF', budgetMax: null });
    const outside = await draft(own, { legalEntityId: entity('MGT') }, foods.token).expect(403);
    expect(outside.body.code).toBe('outside_scope');
    const mgf = (await draft(own, {}, foods.token).expect(201)).body as OfferView;
    // No budget set: approved as soon as it is submitted.
    expect((await act(mgf.id, 'submit', foods.token).expect(200)).body.status).toBe('approved');
  });
});
