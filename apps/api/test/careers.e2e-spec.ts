import {
  applicationEvents,
  applications,
  candidates,
  createDb,
  employees,
  jobOpenings,
  notifications,
  recruitmentSettings,
  runAsTenant,
  tenants,
} from '@gp/db';
import {
  addDays,
  todayIn,
  type CareersJob,
  type CareersPageView,
  type OrgSnapshot,
  type RecruitmentSettingsView,
  type WorkspaceUserCreated,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { Test } from 'supertest';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type LogSender,
} from '../src/modules/notifications/senders.js';
import {
  api,
  bearer,
  bootApp,
  platformToken,
  tenantLogin,
  testEnv,
  uniqueSlug,
} from './test-env.js';

const DAY = 86_400_000;
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;
const PDF = Buffer.from('%PDF-1.4\n% a CV\n%%EOF\n');
/** Enough of a Word file for its type: an Office package with word/document.xml. */
const DOCX = Buffer.concat([
  Buffer.from('PK\x03\x04', 'latin1'),
  Buffer.from('\x14\x00\x00\x00[Content_Types].xml ... word/document.xml ... PK'),
]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.from([0x90, 0, 3, 0]), Buffer.from('PE')]);

// The public careers page of the seeded my-group workspace (careers on), and fresh workspaces
// for a page that is off. Each test makes its own jobs and applies from its own address
// (X-Forwarded-For, with the proxy trusted), so the rate limits of one never touch another.
describe('careers page', () => {
  let app: INestApplication;
  let db: ReturnType<typeof createDb>['db'];
  let pool: ReturnType<typeof createDb>['pool'];
  let email: LogSender<EmailMessage>;
  let tenantId: string;
  let admin: string;
  let platform: string;
  let org: OrgSnapshot;
  let shirin: { id: string; userId: string };
  let seq = 0;
  const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
  const today = todayIn();
  let visitors = 0;
  /** A visitor address of this test's own. */
  const visitor = () => `10.20.${Math.floor(visitors / 250)}.${(visitors++ % 250) + 1}`;

  beforeAll(async () => {
    app = await bootApp({ TRUST_PROXY: '1' });
    email = app.get(EMAIL_SENDER);
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    admin = (await tenantLogin(app, 'my-group')).accessToken;
    platform = await platformToken(app);
    org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200)).body as OrgSnapshot;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    tenantId = tenant!.id;
    const [manager] = await asTenant((tx) =>
      tx
        .select({ id: employees.id, userId: employees.userId })
        .from(employees)
        .where(eq(employees.employeeCode, 'MG-0004')),
    );
    shirin = { id: manager!.id, userId: manager!.userId! };
    // The seed turns the careers page on; these tests rely on it, whatever ran before.
    await saveSettings({ careersEnabled: true, retentionMonths: 12 });
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  const asTenant = <T>(fn: Parameters<typeof runAsTenant<T>>[2]) => runAsTenant(db, tenantId, fn);

  /** Changes some of my-group's settings, keeping the rest. */
  async function saveSettings(body: Record<string, unknown>) {
    const current = (
      await api(app).get('/tenant/recruitment/settings').set(bearer(admin)).expect(200)
    ).body as RecruitmentSettingsView;
    const { updatedAt: _, ...kept } = current;
    return api(app)
      .put('/tenant/recruitment/settings')
      .set(bearer(admin))
      .send({ ...kept, privacyEmail: 'hr@my-group.test', ...body })
      .expect(200);
  }

  /** A job in My Group Textiles, published and open unless said otherwise. */
  async function job(fields: Partial<typeof jobOpenings.$inferInsert> = {}) {
    const [row] = await asTenant((tx) =>
      tx
        .insert(jobOpenings)
        .values({
          tenantId,
          legalEntityId: ref(org.legalEntities, 'MGT'),
          locationId: ref(org.locations, 'GZP'),
          title: `Internal title ${unique()}`,
          employmentType: 'probationer',
          headcount: 2,
          budgetMin: '12500',
          budgetMax: '14000',
          justification: `Secret reason ${unique()}`,
          hiringManagerEmployeeId: shirin.id,
          status: 'open',
          postTitleEn: `Sewing Machine Operator ${unique()}`,
          postTitleBn: 'সেলাই মেশিন অপারেটর',
          descriptionEn: 'We are hiring.\n\n- Single-needle machines',
          descriptionBn: 'আমরা নিয়োগ দিচ্ছি।',
          closesOn: addDays(today, 20),
          publishedAt: new Date(),
          ...fields,
        })
        .returning(),
    );
    return row!;
  }

  /** A workspace assigned by the platform, its careers page never turned on. */
  async function workspace(planCode = 'business') {
    const slug = uniqueSlug('careers');
    const adminEmail = `admin@${slug}.test`;
    const res = await api(app)
      .post('/platform/tenants')
      .set(bearer(platform))
      .send({
        name: `Careers ${slug}`,
        slug,
        industryTemplate: 'corporate',
        billingMode: 'trial',
        planCode,
        accessExpiresAt: new Date(Date.now() + 20 * DAY).toISOString(),
        reason: 'Careers end-to-end test workspace',
        admin: { name: 'Nasrin Sultana', email: adminEmail, password: testEnv().password },
      })
      .expect(201);
    const token = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: slug, email: adminEmail, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;
    return { id: res.body.tenant.id as string, slug, token };
  }

  async function login(role: string) {
    const address = `careers-${role}-${unique()}@example.test`;
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({ name: `Careers ${role}`, email: address, role, password: testEnv().password })
        .expect(201)
    ).body as WorkspaceUserCreated;
    const token = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: 'my-group', email: address, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;
    return { id: user.id, token };
  }

  const get = (path: string, from = visitor()) =>
    api(app).get(`/careers/${path}`).set('x-forwarded-for', from);
  /** A mobile number nobody else here has, typed with a dash as people do. */
  const mobile = () => {
    const digits = String((Date.now() * 13 + seq++ * 7919) % 100_000_000).padStart(8, '0');
    return `019${digits.slice(0, 2)}-${digits.slice(2)}`;
  };
  const fields = (overrides: Record<string, string> = {}) => ({
    fullName: 'Shapla Begum',
    email: `shapla-${unique()}@example.test`,
    phone: mobile(),
    coverNote: 'I worked two years on a single-needle line.',
    consent: 'true',
    language: 'en',
    ...overrides,
  });
  /** Applies as multipart, with the CV as [name, bytes] unless none. */
  function apply(
    jobId: string,
    form: Record<string, string>,
    cv: [string, Buffer] | null = ['Shapla CV.pdf', PDF],
    from = visitor(),
    slug = 'my-group',
  ): Test {
    let req = api(app).post(`/careers/${slug}/jobs/${jobId}/apply`).set('x-forwarded-for', from);
    for (const [key, value] of Object.entries(form)) req = req.field(key, value);
    if (cv) req = req.attach('cv', cv[1], cv[0]);
    return req;
  }
  const candidateBy = async (address: string) =>
    (
      await asTenant((tx) =>
        tx.select().from(candidates).where(eq(candidates.email, address.toLowerCase())),
      )
    )[0];
  const applicationsOf = (candidateId: string) =>
    asTenant((tx) =>
      tx.select().from(applications).where(eq(applications.candidateId, candidateId)),
    );

  it('is not found, every route, until the workspace turns it on and has recruitment', async () => {
    const off = await workspace();
    const from = visitor();
    expect((await get(off.slug, from).expect(404)).body.code).toBe('careers_not_found');
    await get(`${off.slug}/jobs/${randomUUID()}`, from).expect(404);
    await apply(randomUUID(), fields(), undefined, from, off.slug).expect(404);
    await get(`no-such-${unique()}`, from).expect(404);

    const on = (
      await api(app)
        .put('/tenant/recruitment/settings')
        .set(bearer(off.token))
        .send({ careersEnabled: true, introEn: 'We make shirts.' })
        .expect(200)
    ).body as RecruitmentSettingsView;
    expect(on).toMatchObject({ careersEnabled: true, retentionMonths: 12, privacyEmail: null });
    const page = (await get(off.slug, from).expect(200)).body as CareersPageView;
    expect(page).toEqual({
      workspace: { name: `Careers ${off.slug}`, slug: off.slug },
      introEn: 'We make shirts.',
      introBn: null,
      jobs: [],
    });

    // Off again, it is gone again.
    await api(app)
      .put('/tenant/recruitment/settings')
      .set(bearer(off.token))
      .send({ careersEnabled: false })
      .expect(200);
    await get(off.slug, from).expect(404);

    // A plan without recruitment has no careers page, whatever its settings say.
    const growth = await workspace('growth');
    await runAsTenant(db, growth.id, (tx) =>
      tx.insert(recruitmentSettings).values({ tenantId: growth.id, careersEnabled: true }),
    );
    await get(growth.slug, from).expect(404);
    await api(app).get('/tenant/recruitment/settings').set(bearer(growth.token)).expect(403);
  });

  it('keeps its settings for HR: retention from 1 to 60 months, the row made on first save', async () => {
    const fresh = await workspace();
    const before = (
      await api(app).get('/tenant/recruitment/settings').set(bearer(fresh.token)).expect(200)
    ).body as RecruitmentSettingsView;
    expect(before).toEqual({
      careersEnabled: false,
      introEn: null,
      introBn: null,
      retentionMonths: 12,
      privacyEmail: null,
      updatedAt: null,
    });
    for (const months of [0, 61]) {
      await api(app)
        .put('/tenant/recruitment/settings')
        .set(bearer(fresh.token))
        .send({ careersEnabled: true, retentionMonths: months })
        .expect(400);
    }
    const saved = (
      await api(app)
        .put('/tenant/recruitment/settings')
        .set(bearer(fresh.token))
        .send({ careersEnabled: true, retentionMonths: 6, privacyEmail: 'Privacy@Example.test' })
        .expect(200)
    ).body as RecruitmentSettingsView;
    expect(saved).toMatchObject({ retentionMonths: 6, privacyEmail: 'privacy@example.test' });
    expect(saved.updatedAt).not.toBeNull();

    const staff = await login('payroll_officer');
    await api(app).get('/tenant/recruitment/settings').set(bearer(staff.token)).expect(403);
  });

  it('lists open jobs and shows one with public fields only, the salary only when shown', async () => {
    const hidden = await job();
    const shown = await job({ showSalary: true, employmentType: 'permanent' });
    const draft = await job({ status: 'draft', publishedAt: null });
    const lapsed = await job({ closesOn: addDays(today, -1) });
    const from = visitor();

    const page = (await get('my-group', from).expect(200)).body as CareersPageView;
    expect(page.workspace).toEqual({ name: 'My Group', slug: 'my-group' });
    const ids = page.jobs.map((j) => j.id);
    expect(ids).toEqual(expect.arrayContaining([hidden.id, shown.id]));
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(lapsed.id);
    const listed = page.jobs.find((j) => j.id === hidden.id)!;
    expect(listed).toEqual({
      id: hidden.id,
      titleEn: hidden.postTitleEn,
      titleBn: 'সেলাই মেশিন অপারেটর',
      company: org.legalEntities.find((e) => e.code === 'MGT')!.name,
      location: org.locations.find((l) => l.code === 'GZP')!.name,
      employmentType: 'probationer',
      closesOn: hidden.closesOn,
      publishedAt: hidden.publishedAt!.toISOString(),
      salary: null,
    });
    expect(page.jobs.find((j) => j.id === shown.id)!.salary).toEqual({
      min: '12500.00',
      max: '14000.00',
    });

    const one = (await get(`my-group/jobs/${hidden.id}`, from).expect(200)).body as CareersJob;
    expect(one).toMatchObject({
      closed: false,
      id: hidden.id,
      salary: null,
      descriptionEn: hidden.descriptionEn,
      descriptionBn: hidden.descriptionBn,
      retentionMonths: 12,
      privacyEmail: 'hr@my-group.test',
      workspace: { name: 'My Group', slug: 'my-group' },
    });
    const text = JSON.stringify([listed, one]);
    for (const secret of [hidden.title, hidden.justification!, shirin.id, '12500.00']) {
      expect(text).not.toContain(secret);
    }
    expect(JSON.stringify(one)).not.toMatch(/budget|justification|hiringManager/);

    // A draft, or another workspace's job, is not found; a lapsed one says it is closed.
    await get(`my-group/jobs/${draft.id}`, from).expect(404);
    await get('my-group/jobs/not-a-job', from).expect(404);
    const other = await workspace();
    await api(app)
      .put('/tenant/recruitment/settings')
      .set(bearer(other.token))
      .send({ careersEnabled: true })
      .expect(200);
    await get(`${other.slug}/jobs/${hidden.id}`, from).expect(404);
    expect((await get(`my-group/jobs/${lapsed.id}`, from).expect(200)).body).toEqual({
      closed: true,
      workspace: { name: 'My Group', slug: 'my-group' },
      titleEn: lapsed.postTitleEn,
      titleBn: lapsed.postTitleBn,
    });
  });

  it('applies with a PDF and with a Word CV; the same person again is the same candidate', async () => {
    const first = await job();
    const second = await job();
    const address = `Rina.${unique()}@Example.test`;
    const phone = mobile();
    const res = await apply(first.id, fields({ email: address, phone, language: 'bn' })).expect(
      201,
    );
    expect(res.body).toEqual({ received: true });

    const candidate = await candidateBy(address);
    expect(candidate).toMatchObject({
      fullName: 'Shapla Begum',
      email: address.toLowerCase(),
      phone: `+88${phone.replace('-', '')}`,
      source: 'careers_page',
      language: 'bn',
      talentPool: false,
      cvFileName: 'Shapla CV.pdf',
      cvContentType: 'application/pdf',
      cvSizeBytes: PDF.length,
    });
    expect(candidate!.consentAt).not.toBeNull();
    const [application] = await applicationsOf(candidate!.id);
    expect(application).toMatchObject({
      openingId: first.id,
      stage: 'applied',
      source: 'careers_page',
      coverNote: 'I worked two years on a single-needle line.',
    });
    const events = await asTenant((tx) =>
      tx
        .select()
        .from(applicationEvents)
        .where(eq(applicationEvents.applicationId, application!.id)),
    );
    expect(events).toEqual([
      expect.objectContaining({ kind: 'stage', toStage: 'applied', actorUserId: null }),
    ]);

    // Again for another job, by the same address in other capitals, with a Word CV.
    await apply(second.id, fields({ email: address.toUpperCase(), talentPool: 'true' }), [
      'cv.docx',
      DOCX,
    ]).expect(201);
    const again = await candidateBy(address);
    expect(again).toMatchObject({
      id: candidate!.id,
      language: 'en',
      talentPool: true,
      cvContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      cvFileName: 'cv.docx',
    });
    expect((await applicationsOf(candidate!.id)).map((a) => a.openingId).toSorted()).toEqual(
      [first.id, second.id].toSorted(),
    );

    // Once per job.
    expect((await apply(first.id, fields({ email: address })).expect(409)).body.code).toBe(
      'already_applied',
    );
  });

  it('refuses a CV that is not a PDF or Word file, whatever its name, and a missing one', async () => {
    const open = await job();
    const exe = fields();
    expect((await apply(open.id, exe, ['cv.pdf', EXE]).expect(400)).body.code).toBe('cv_type');
    expect((await apply(open.id, fields(), null).expect(400)).body.code).toBe('cv_required');
    expect(await candidateBy(exe.email)).toBeUndefined();
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    expect((await apply(open.id, fields(), ['big.pdf', big]).expect(400)).body.code).toBe(
      'cv_too_large',
    );
  });

  it('needs consent, and quietly drops what fills the hidden field', async () => {
    const open = await job();
    const without = fields({ consent: 'false' });
    const refused = await apply(open.id, without).expect(400);
    expect(refused.body.issues).toEqual([expect.objectContaining({ path: 'consent' })]);
    const { consent: _, ...missing } = fields();
    await apply(open.id, missing).expect(400);
    expect(await candidateBy(without.email)).toBeUndefined();

    const bot = fields({ website: 'http://spam.example' });
    expect((await apply(open.id, bot).expect(201)).body).toEqual({ received: true });
    expect(await candidateBy(bot.email)).toBeUndefined();
    expect(email.sent.some((m) => m.to === bot.email)).toBe(false);
  });

  it('limits applying per address and per email', async () => {
    const open = await job();
    const from = visitor();
    // The hidden field still counts against the address.
    for (let i = 0; i < 10; i++) {
      await apply(open.id, fields({ website: 'x' }), undefined, from).expect(201);
    }
    expect((await apply(open.id, fields(), undefined, from).expect(429)).body.code).toBe(
      'too_many_attempts',
    );

    const same = fields();
    for (let i = 0; i < 3; i++) await apply(open.id, same, null).expect(400);
    expect((await apply(open.id, same).expect(429)).body.code).toBe('too_many_attempts');
  });

  it('refuses a job no longer open, and one never published', async () => {
    const closed = await job({ status: 'closed', closedAt: new Date() });
    const filled = await job({ status: 'filled' });
    const lapsed = await job({ closesOn: addDays(today, -3) });
    const approved = await job({ status: 'approved', publishedAt: null });
    for (const j of [closed, filled, lapsed]) {
      expect((await apply(j.id, fields()).expect(409)).body.code).toBe('job_closed');
    }
    await apply(approved.id, fields()).expect(404);
    const page = (await get(`my-group/jobs/${filled.id}`).expect(200)).body as CareersJob;
    expect(page.closed).toBe(true);
  });

  it('tells HR in the company and the hiring manager, and emails the candidate in their language', async () => {
    await saveSettings({ retentionMonths: 18 });
    const textilesHr = await login('hr_officer');
    const foodsHr = await login('hr_officer');
    await api(app)
      .put(`/tenant/users/${foodsHr.id}/scopes`)
      .set(bearer(admin))
      .send({ legalEntityIds: [ref(org.legalEntities, 'MGF')] })
      .expect(200);
    const open = await job();

    const bangla = fields({ language: 'bn', fullName: 'রিনা আক্তার' });
    await apply(open.id, bangla).expect(201);
    const candidate = await candidateBy(bangla.email);
    const [application] = await applicationsOf(candidate!.id);
    const told = await asTenant((tx) =>
      tx
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.event, 'recruitment.application'),
            inArray(notifications.userId, [textilesHr.id, foodsHr.id, shirin.userId]),
            eq(notifications.link, `/workspace/recruitment/applications/${application!.id}`),
          ),
        ),
    );
    expect(told.map((n) => n.userId).toSorted()).toEqual([textilesHr.id, shirin.userId].toSorted());
    expect(told.find((n) => n.userId === textilesHr.id)!.title).toContain(open.title);

    const mail = email.sent.filter((m) => m.to === bangla.email);
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toContain('সেলাই মেশিন অপারেটর');
    expect(mail[0]!.text).toContain('১৮ মাস');
    expect(mail[0]!.text).toContain('hr@my-group.test');
    // Nothing typed into the form goes into the email.
    expect(mail[0]!.text).not.toContain('রিনা');

    const pooled = fields({ talentPool: 'on' });
    await apply(open.id, pooled).expect(201);
    const [english] = email.sent.filter((m) => m.to === pooled.email);
    expect(english!.subject).toBe(
      `Your application for ${open.postTitleEn} at ${org.legalEntities.find((e) => e.code === 'MGT')!.name}`,
    );
    expect(english!.text).toContain('until you withdraw your consent');
    expect(english!.text).not.toContain('18 months');

    await saveSettings({ careersEnabled: true, retentionMonths: 12 });
  });
});
