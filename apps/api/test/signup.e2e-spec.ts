import type {
  OrgSnapshot,
  ShiftView,
  SignupStarted,
  SignupView,
  SlugCheck,
  TenantAccessView,
  TenantSession,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type LogSender,
} from '../src/modules/notifications/senders.js';
import { api, bearer, bootApp, platformToken } from './test-env.js';

describe('self-serve sign-up', () => {
  let app: INestApplication;
  let email: LogSender<EmailMessage>;
  const stamp = Date.now().toString(36);
  const owner = `owner-${stamp}@example.test`;
  const codeIn = (to: string) =>
    email.sent.findLast((m) => m.to === to)?.text.match(/\b(\d{6})\b/)?.[1] ?? null;
  const start = (body: Record<string, unknown>) => api(app).post('/signup').send(body);

  beforeAll(async () => {
    app = await bootApp();
    email = app.get(EMAIL_SENDER);
  });
  afterAll(() => app.close());

  it('turns a verified email into a trial workspace with the industry’s organisation', async () => {
    const started = (
      await start({
        name: 'Rumana Akter',
        email: owner.toUpperCase(),
        company: 'Rupali Knit Wear Ltd',
        industryTemplate: 'rmg',
        language: 'en',
      }).expect(201)
    ).body as SignupStarted;
    expect(started).toMatchObject({ expiresInSeconds: 900, suggestedSlug: 'rupali-knit-wear' });
    const code = codeIn(owner);
    expect(code).toMatch(/^\d{6}$/);

    const verify = (body: Record<string, unknown>) =>
      api(app)
        .post('/signup/verify')
        .send({ signupId: started.signupId, password: 'Rupali-2026!', ...body });
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await verify({ code: wrong, slug: 'rupali-knit-wear' }).expect(400)).body.code).toBe(
      'code_wrong',
    );
    expect((await verify({ code, slug: 'my-group' }).expect(409)).body.code).toBe('slug_taken');
    const slug = `rupali-${stamp}`;
    const created = (await verify({ code, slug }).expect(200)).body as {
      tenant: { slug: string };
      login: TenantSession;
    };
    expect(created.tenant.slug).toBe(slug);
    const token = created.login.accessToken;
    expect(created.login.user).toMatchObject({ email: owner, role: 'tenant_admin' });
    // The code works once.
    await verify({ code, slug: `${slug}-x` }).expect(404);

    const access = (await api(app).get('/tenant/access').set(bearer(token)).expect(200))
      .body as TenantAccessView;
    expect(access.tenant).toMatchObject({
      billingMode: 'trial',
      planCode: 'business',
      industryTemplate: 'rmg',
    });
    expect(access.access).toMatchObject({ accessState: 'full', reason: 'trial' });
    expect(access.access.features).toEqual(expect.arrayContaining(['payroll', 'attendance']));
    const days = (Date.parse(access.tenant.accessExpiresAt!) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);

    // The RMG template: the company, a factory, Sewing's lines, worker designations, two shifts.
    const org = (await api(app).get('/tenant/org').set(bearer(token)).expect(200))
      .body as OrgSnapshot;
    expect(org.legalEntities.map((e) => e.name)).toEqual(['Rupali Knit Wear Ltd']);
    expect(org.locations.map((l) => [l.code, l.kind])).toEqual(
      expect.arrayContaining([
        ['HO', 'head_office'],
        ['FAC', 'factory'],
      ]),
    );
    const sewing = org.orgUnits.find((u) => u.code === 'SEW')!;
    expect(org.orgUnits.filter((u) => u.parentId === sewing.id).map((u) => u.code)).toEqual(
      expect.arrayContaining(['L1', 'L2']),
    );
    expect(org.designations.find((d) => d.code === 'SO')).toMatchObject({
      workerCategory: 'worker',
      nameBn: 'সেলাই অপারেটর',
    });
    const shifts = (await api(app).get('/tenant/attendance/shifts').set(bearer(token)).expect(200))
      .body as ShiftView[];
    expect(shifts.find((s) => s.isDefault)?.code).toBe('DAY');
    expect(shifts.map((s) => s.code)).toEqual(expect.arrayContaining(['GEN', 'DAY', 'NIGHT']));

    // One trial per address: asking again sends a reminder to sign in, not a code.
    await start({
      name: 'Rumana Akter',
      email: owner,
      company: 'Rupali Again',
      industryTemplate: 'corporate',
    }).expect(201);
    const notice = email.sent.findLast((m) => m.to === owner)!;
    expect(notice.subject).toBe('Your Good People workspace');
    expect(notice.text).toContain(slug);

    const platform = await platformToken(app);
    const listed = (await api(app).get('/platform/signups').set(bearer(platform)).expect(200))
      .body as SignupView[];
    expect(listed.find((s) => s.id === started.signupId)).toMatchObject({
      email: owner,
      company: 'Rupali Knit Wear Ltd',
      industryTemplate: 'rmg',
      stage: 'workspace_created',
      tenant: { slug },
    });
    await api(app).get('/platform/signups').set(bearer(token)).expect(403);
  });

  it('checks workspace addresses and keeps bots and floods out', async () => {
    const taken = (await api(app).get('/signup/slug?slug=my-group').expect(200)).body as SlugCheck;
    expect(taken).toEqual({ slug: 'my-group', available: false, suggestion: 'my-group-2' });
    const reserved = (await api(app).get('/signup/slug?slug=admin').expect(200)).body as SlugCheck;
    expect(reserved).toMatchObject({ available: false, suggestion: 'admin-hr' });
    const free = (await api(app).get(`/signup/slug?slug=free-${stamp}`).expect(200))
      .body as SlugCheck;
    expect(free).toMatchObject({ available: true, suggestion: null });

    // The hidden field: the same answer, and nothing sent.
    const bot = `bot-${stamp}@example.test`;
    await start({
      name: 'Bot',
      email: bot,
      company: 'Spam Co',
      industryTemplate: 'other',
      website: 'http://spam.example',
    }).expect(201);
    expect(email.sent.some((m) => m.to === bot)).toBe(false);

    const flood = `flood-${stamp}@example.test`;
    const body = { name: 'Flood', email: flood, company: 'Flood Ltd', industryTemplate: 'other' };
    for (let i = 0; i < 3; i++) await start(body).expect(201);
    expect((await start(body).expect(429)).body.code).toBe('too_many_attempts');
  });

  it('is closed where the server turns sign-up off', async () => {
    const closed = await bootApp({ SIGNUP_ENABLED: 'off' });
    try {
      const res = await api(closed)
        .post('/signup')
        .send({ name: 'X Y', email: 'x@example.test', company: 'X Ltd', industryTemplate: 'other' })
        .expect(403);
      expect(res.body.code).toBe('signup_disabled');
    } finally {
      await closed.close();
    }
  });
});
