import {
  authSessions,
  createDb,
  hashPassword,
  platformAuditLog,
  platformUsers,
  runAsTenant,
  supportAccessGrants,
  supportAccessSessions,
  tenantAuditLog,
  tenants,
  tenantUsers,
  type Database,
} from '@gp/db';
import type {
  EmployeeDetail,
  EmployeeListItem,
  OrgSnapshot,
  Page,
  PlatformSupportGrantView,
  SupportAccessGrantView,
  SupportSessionOpened,
  SupportSessionView,
  TaxYearView,
  TokenPair,
  WorkspaceUserListItem,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  EMAIL_SENDER,
  SMS_SENDER,
  type EmailMessage,
  type LogSender,
  type SmsMessage,
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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Each test makes its own workspaces (or its own grant on my-group, revoked at the end), so the
// tests pass in any order.
describe('support access', () => {
  let app: INestApplication;
  let db: Database;
  let pool: ReturnType<typeof createDb>['pool'];
  let email: LogSender<EmailMessage>;
  let sms: LogSender<SmsMessage>;
  let platform: string;
  let support: { id: string; name: string; token: string };
  let ops: string;
  const stamp = Date.now().toString(36);

  /** A platform login with this role, made for the run. */
  async function staff(role: 'support' | 'platform_ops', name: string) {
    const address = `${role}-${stamp}@goodpeople.test`;
    const [row] = await db
      .insert(platformUsers)
      .values({ email: address, name, role, passwordHash: await hashPassword(testEnv().password) })
      .returning({ id: platformUsers.id });
    return { id: row!.id, name, token: await platformToken(app, address) };
  }

  /** A new workspace and its admin's session. */
  async function workspace() {
    const slug = uniqueSlug('sa');
    const admin = `admin@${slug}.test`;
    const res = await api(app)
      .post('/platform/tenants')
      .set(bearer(platform))
      .send({
        name: `Support ${slug}`,
        slug,
        industryTemplate: 'corporate',
        billingMode: 'complimentary',
        planCode: 'business',
        reason: 'Support access end-to-end test workspace',
        admin: { name: 'Nasrin Sultana', email: admin, password: testEnv().password },
      })
      .expect(201);
    const login = await api(app)
      .post('/auth/login')
      .send({ tenant: slug, email: admin, password: testEnv().password })
      .expect(200);
    return {
      id: res.body.tenant.id as string,
      slug,
      admin,
      token: login.body.accessToken as string,
    };
  }

  const grant = (token: string, body: Record<string, unknown> = { days: 2 }) =>
    api(app).post('/tenant/support/access').set(bearer(token)).send(body);
  const granted = async (token: string, body?: Record<string, unknown>) =>
    (await grant(token, body).expect(201)).body as SupportAccessGrantView;
  const revoke = (token: string, id: string) =>
    api(app).post(`/tenant/support/access/${id}/revoke`).set(bearer(token));
  const open = (token: string, tenantId: string, grantId: string) =>
    api(app)
      .post('/platform/support/access/sessions')
      .set(bearer(token))
      .send({ tenantId, grantId });
  const opened = async (tenantId: string, grantId: string) =>
    (await open(support.token, tenantId, grantId).expect(201)).body as SupportSessionOpened;
  const refresh = (refreshToken: string) => api(app).post('/auth/refresh').send({ refreshToken });
  const supportLogin = async (tenantId: string) => {
    const [row] = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(tenantUsers)
        .where(eq(tenantUsers.email, `support+${support.id}@support.goodpeople.invalid`)),
    );
    return row!;
  };
  const supportViews = (tenantId: string, actorUserId: string) =>
    runAsTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(tenantAuditLog)
        .where(
          and(
            eq(tenantAuditLog.action, 'support.viewed'),
            eq(tenantAuditLog.actorUserId, actorUserId),
          ),
        ),
    );

  beforeAll(async () => {
    app = await bootApp();
    email = app.get(EMAIL_SENDER);
    sms = app.get(SMS_SENDER);
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    platform = await platformToken(app);
    support = await staff('support', 'Rafiq Islam');
    ops = (await staff('platform_ops', 'Mitu Akter')).token;
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('lets a workspace admin grant access for up to a week and revoke it, in its audit log', async () => {
    const ws = await workspace();
    expect((await grant(ws.token, { days: 8 }).expect(400)).body.code).toBe('validation_failed');
    await grant(ws.token, { days: 0 }).expect(400);
    expect(
      (await grant(ws.token, { days: 1, ticketId: crypto.randomUUID() }).expect(400)).body.code,
    ).toBe('unknown_ticket');

    const before = Date.now();
    const view = await granted(ws.token, { days: 3, note: 'Payroll for October looks wrong' });
    expect(view).toMatchObject({
      tenantId: ws.id,
      ticketId: null,
      grantedBy: { name: 'Nasrin Sultana' },
      note: 'Payroll for October looks wrong',
      revokedAt: null,
      active: true,
      sessions: [],
    });
    expect(Date.parse(view.endsAt) - before).toBeGreaterThanOrEqual(3 * DAY - 1000);
    expect(Date.parse(view.endsAt) - before).toBeLessThan(3 * DAY + 60_000);

    const list = (await api(app).get('/tenant/support/access').set(bearer(ws.token)).expect(200))
      .body as SupportAccessGrantView[];
    expect(list.map((g) => g.id)).toEqual([view.id]);

    const revoked = (await revoke(ws.token, view.id).expect(200)).body as SupportAccessGrantView;
    expect(revoked).toMatchObject({ id: view.id, active: false, revokedAt: expect.any(String) });
    // Revoking again changes nothing; another workspace's grant is not found.
    await revoke(ws.token, view.id).expect(200);
    const other = await workspace();
    await revoke(other.token, view.id).expect(404);
    expect((await api(app).get('/tenant/support/access').set(bearer(other.token))).body).toEqual(
      [],
    );

    const audit = await runAsTenant(db, ws.id, (tx) =>
      tx.select().from(tenantAuditLog).where(eq(tenantAuditLog.entityId, view.id)),
    );
    expect(audit.map((a) => a.action).toSorted()).toEqual([
      'support_access.grant',
      'support_access.revoke',
    ]);
  });

  it('leaves granting to workspace admins', async () => {
    const ws = await workspace();
    const hrEmail = `hr@${ws.slug}.test`;
    await api(app)
      .post('/tenant/users')
      .set(bearer(ws.token))
      .send({
        name: 'Kamal Hossain',
        email: hrEmail,
        role: 'hr_admin',
        password: testEnv().password,
      })
      .expect(201);
    const hr = await api(app)
      .post('/auth/login')
      .send({ tenant: ws.slug, email: hrEmail, password: testEnv().password })
      .expect(200);
    expect((await grant(hr.body.accessToken).expect(403)).body.code).toBe('role_not_allowed');
    await api(app).get('/tenant/support/access').set(bearer(hr.body.accessToken)).expect(403);
  });

  it('opens a workspace only under an active grant of that workspace', async () => {
    const ws = await workspace();
    const other = await workspace();
    const code = async (tenantId: string, grantId: string, token = support.token) =>
      (await open(token, tenantId, grantId).expect(403)).body.code;

    // No grant at all.
    expect(await code(ws.id, crypto.randomUUID())).toBe('no_support_access');
    const own = await granted(ws.token);
    // Another workspace's grant.
    expect(await code(other.id, own.id)).toBe('no_support_access');
    // Ended by time.
    const expiring = await granted(other.token);
    await db
      .update(supportAccessGrants)
      .set({ endsAt: new Date(Date.now() - 60_000) })
      .where(eq(supportAccessGrants.id, expiring.id));
    expect(await code(other.id, expiring.id)).toBe('no_support_access');
    // Revoked.
    const revoked = await granted(other.token);
    await revoke(other.token, revoked.id).expect(200);
    expect(await code(other.id, revoked.id)).toBe('no_support_access');

    // Operations can see the grants but not open one; a workspace login reaches neither.
    expect(await code(ws.id, own.id, ops)).toBe('platform_role');
    const listed = (await api(app).get('/platform/support/access').set(bearer(ops)).expect(200))
      .body as PlatformSupportGrantView[];
    expect(listed.find((g) => g.id === own.id)?.tenant).toMatchObject({
      id: ws.id,
      slug: ws.slug,
      name: `Support ${ws.slug}`,
    });
    expect(listed.map((g) => g.id)).not.toContain(expiring.id);
    expect(listed.map((g) => g.id)).not.toContain(revoked.id);
    for (const req of [
      () => api(app).get('/platform/support/access'),
      () =>
        api(app)
          .post('/platform/support/access/sessions')
          .send({ tenantId: ws.id, grantId: own.id }),
    ]) {
      expect((await req().set(bearer(ws.token)).expect(403)).body.code).toBe('platform_only');
    }

    // The super admin may open one.
    await open(platform, ws.id, own.id).expect(201);
  });

  it('shows support everything but identity numbers, refuses every write and logs each request', async () => {
    const admin = await tenantLogin(app, 'my-group');
    const [myGroup] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    const view = await granted(admin.accessToken, { days: 1 });
    try {
      const session = await opened(myGroup!.id, view.id);
      const as = bearer(session.accessToken);

      const page = (await api(app).get('/tenant/employees?search=MG-0005').set(as).expect(200))
        .body as Page<EmployeeListItem>;
      const employee = page.items.find((e) => e.employeeCode === 'MG-0005')!;
      const detail = (await api(app).get(`/tenant/employees/${employee.id}`).set(as).expect(200))
        .body as EmployeeDetail;
      expect(detail.identity!.nid).toBe('••••0005');
      const account = (await api(app).get('/account').set(as).expect(200)).body;
      expect(account).toMatchObject({ role: 'support', hasPassword: false });
      // What the workspace layout and home page load, for a login with no employee record.
      for (const path of [
        '/tenant/access',
        '/tenant/approvals/count',
        '/tenant/notifications?unread=true',
        '/tenant/legal-entities',
        '/tenant/users',
      ]) {
        await api(app).get(path).set(as).expect(200);
      }
      await api(app).get('/tenant/me/employee').set(as).expect(404);
      const banner = (await api(app).get('/tenant/support/access/session').set(as).expect(200))
        .body as SupportSessionView;
      expect(banner).toMatchObject({
        id: session.sessionId,
        platformUserName: 'Rafiq Islam',
        tenantName: myGroup!.name,
        endsAt: session.endsAt,
      });

      const writes = [
        () => api(app).post('/tenant/employees').send({ fullName: 'Nobody' }),
        () => api(app).patch(`/tenant/employees/${employee.id}`).send({ fullName: 'Changed' }),
        // Writable for a read-only workspace, never for support.
        () => api(app).post('/tenant/billing/plan').send({ planCode: 'business' }),
        () => api(app).post('/tenant/support/access').send({ days: 7 }),
        // The login's own account has no access guard of its own.
        () => api(app).patch('/account/preferences').send({ language: 'bn' }),
        () => api(app).post('/account/mfa/setup'),
      ];
      for (const write of writes) {
        expect((await write().set(as).expect(403)).body.code).toBe('support_read_only');
      }

      const login = await supportLogin(myGroup!.id);
      expect(login).toMatchObject({ role: 'support', name: 'Rafiq Islam (Good People support)' });
      await vi.waitFor(
        async () => {
          // Earlier tests' sessions use the same login; each entry names its session.
          const routes = (await supportViews(myGroup!.id, login.id))
            .filter((v) => v.entityId === session.sessionId)
            .map(
              (v) => v.after as { route: string; params: Record<string, string>; status: number },
            );
          expect(routes).toContainEqual({
            method: 'GET',
            route: 'GET /tenant/employees/:id',
            params: { id: employee.id },
            status: 200,
          });
          expect(routes).toContainEqual(
            expect.objectContaining({ route: 'GET /tenant/employees', params: {} }),
          );
          expect(routes).toContainEqual(expect.objectContaining({ route: 'GET /account' }));
          // Refused writes are recorded too, with their status.
          expect(routes).toContainEqual(
            expect.objectContaining({ route: 'POST /tenant/employees', status: 403 }),
          );
          expect(routes).toContainEqual(
            expect.objectContaining({ route: 'PATCH /account/preferences', status: 403 }),
          );
          // The query (a search, here) is never recorded.
          expect(JSON.stringify(routes)).not.toContain('MG-0005');
        },
        { timeout: 5000 },
      );
      // The workspace admin sees them, with who it was.
      const activity = (
        await api(app).get('/tenant/support/access/activity').set(bearer(admin.accessToken))
      ).body as { by: string; route: string }[];
      expect(activity).toContainEqual(
        expect.objectContaining({
          by: 'Rafiq Islam (Good People support)',
          route: 'GET /tenant/employees/:id',
        }),
      );
    } finally {
      await revoke(admin.accessToken, view.id).expect(200);
    }
  });

  it('keeps TINs and identity documents from support: tax files refused, the tax year masked', async () => {
    const admin = await tenantLogin(app, 'my-group');
    const hr = bearer(admin.accessToken);
    const [myGroup] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    const org = (await api(app).get('/tenant/org').set(hr).expect(200)).body as OrgSnapshot;
    const tin = `${Date.now()}`.slice(-12).padStart(12, '7');
    const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
    const hired = await api(app)
      .post('/tenant/employees')
      .set(hr)
      .send({
        employeeCode: `SA-${stamp}`,
        fullName: 'Rokeya Begum',
        fatherName: 'Abdul Karim',
        motherName: 'Amena Khatun',
        dateOfBirth: '1995-03-14',
        gender: 'female',
        religion: 'islam',
        mobilePhone: '01712345670',
        presentAddress: address,
        permanentAddress: address,
        identity: { nid: `${Date.now()}`.slice(-10), tin },
        joinedOn: '2026-10-01',
        probationEndsOn: '2026-12-31',
        job: {
          legalEntityId: org.legalEntities.find((e) => e.code === 'MGT')!.id,
          locationId: org.locations.find((l) => l.code === 'GZP')!.id,
          orgUnitId: org.orgUnits.find((u) => u.code === 'MGT-L1')!.id,
          designationId: org.designations.find((d) => d.code === 'SO')!.id,
          employmentType: 'probationer',
          workerCategory: 'worker',
        },
      })
      .expect(201);
    const employeeId = hired.body.employee.id as string;
    const upload = async (category: string, name: string) =>
      (
        await api(app)
          .post(`/tenant/employees/${employeeId}/documents`)
          .set(hr)
          .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), name)
          .field('category', category)
          .field('title', name)
          .expect(201)
      ).body.id as string;
    const nidScan = await upload('nid', 'nid-front.pdf');
    const diploma = await upload('educational_certificate', 'hsc.pdf');

    const view = await granted(admin.accessToken, { days: 1 });
    try {
      const as = bearer((await opened(myGroup!.id, view.id)).accessToken);
      const hiddenFrom = async (path: string) =>
        expect((await api(app).get(path).set(as).expect(403)).body.code).toBe(
          'support_identity_hidden',
        );
      await hiddenFrom(`/tenant/employees/${employeeId}/tax/certificate`);
      await hiddenFrom('/tenant/payroll/tax/register');
      await hiddenFrom('/tenant/payroll/tax/quarter?fiscalYear=2026-27&quarter=1');
      await hiddenFrom(`/tenant/documents/${nidScan}/file`);
      await api(app).get(`/tenant/documents/${diploma}/file`).set(as).expect(200);

      const year = (await api(app).get(`/tenant/employees/${employeeId}/tax`).set(as).expect(200))
        .body as TaxYearView;
      expect(year.employee.tin).toBe(`••••${tin.slice(-4)}`);
      // The workspace's own staff still see it.
      const own = (await api(app).get(`/tenant/employees/${employeeId}/tax`).set(hr).expect(200))
        .body as TaxYearView;
      expect(own.employee.tin).toBe(tin);
    } finally {
      await revoke(admin.accessToken, view.id).expect(200);
    }
  });

  it('tells the admin who granted it, in their language, and ends with the grant or in eight hours', async () => {
    const ws = await workspace();
    await api(app)
      .patch('/account/preferences')
      .set(bearer(ws.token))
      .send({ language: 'bn' })
      .expect(200);
    const short = await granted(ws.token, { days: 1 });
    // A grant that ends sooner than eight hours from now ends the session with it.
    const soon = new Date(Date.now() + 2 * HOUR);
    await db
      .update(supportAccessGrants)
      .set({ endsAt: soon })
      .where(eq(supportAccessGrants.id, short.id));
    const first = await opened(ws.id, short.id);
    expect(Date.parse(first.endsAt)).toBe(soon.getTime());
    expect(first.grant.sessions).toEqual([
      { platformUserName: 'Rafiq Islam', startedAt: expect.any(String) },
    ]);

    const long = await granted(ws.token, { days: 5 });
    const before = Date.now();
    const second = await opened(ws.id, long.id);
    expect(Date.parse(second.endsAt) - before).toBeGreaterThanOrEqual(8 * HOUR - 1000);
    expect(Date.parse(second.endsAt) - before).toBeLessThan(8 * HOUR + 60_000);
    const [auth] = await db
      .select()
      .from(supportAccessSessions)
      .innerJoin(authSessions, eq(authSessions.id, supportAccessSessions.authSessionId))
      .where(eq(supportAccessSessions.id, second.sessionId));
    expect(auth!.auth_sessions.expiresAt.toISOString()).toBe(second.endsAt);

    const mail = email.sent.filter((m) => m.to === ws.admin);
    expect(mail).toHaveLength(2);
    expect(mail[0]!.subject).toBe(`গুড পিপল সহায়তা দল Support ${ws.slug} খুলেছে`);
    expect(mail[0]!.text).toContain('Rafiq Islam');
    const audit = await db
      .select()
      .from(platformAuditLog)
      .where(
        and(
          eq(platformAuditLog.tenantId, ws.id),
          eq(platformAuditLog.action, 'support_access.open'),
        ),
      );
    expect(audit).toHaveLength(2);
    expect(audit.every((a) => a.actorId === support.id)).toBe(true);
  });

  it('keeps the support login out of the users list, edits, passwords and codes', async () => {
    const ws = await workspace();
    const view = await granted(ws.token);
    await opened(ws.id, view.id);
    const login = await supportLogin(ws.id);

    const users = (await api(app).get('/tenant/users').set(bearer(ws.token)).expect(200))
      .body as WorkspaceUserListItem[];
    expect(users.map((u) => u.email)).toEqual([ws.admin]);
    await api(app)
      .patch(`/tenant/users/${login.id}`)
      .set(bearer(ws.token))
      .send({ role: 'tenant_admin' })
      .expect(404);
    await api(app)
      .patch(`/tenant/users/${login.id}`)
      .set(bearer(ws.token))
      .send({ disabled: true })
      .expect(404);
    await api(app)
      .post(`/tenant/users/${login.id}/reset-password`)
      .set(bearer(ws.token))
      .expect(404);
    await api(app).post(`/tenant/users/${login.id}/reset-mfa`).set(bearer(ws.token)).expect(404);

    await api(app)
      .post('/auth/login')
      .send({ tenant: ws.slug, email: login.email, password: testEnv().password })
      .expect(401);
    // Even with a mobile number, a support login is sent no code and none signs it in.
    const local = `017${Date.now().toString().slice(-8)}`;
    await runAsTenant(db, ws.id, (tx) =>
      tx
        .update(tenantUsers)
        .set({ phone: `+88${local}` })
        .where(eq(tenantUsers.id, login.id)),
    );
    await api(app).post('/auth/otp/request').send({ tenant: ws.slug, phone: local }).expect(202);
    expect(sms.sent.some((m) => m.to === `+88${local}`)).toBe(false);
    await api(app)
      .post('/auth/otp/verify')
      .send({ tenant: ws.slug, phone: local, code: '123456' })
      .expect(401);
  });

  it('refuses the next request and the refresh once the workspace revokes access', async () => {
    const ws = await workspace();
    const view = await granted(ws.token);
    const session = await opened(ws.id, view.id);

    // A refresh keeps the session's end and moves the support session to the new token.
    const renewed = (await refresh(session.refreshToken).expect(200)).body as TokenPair;
    const [row] = await db
      .select()
      .from(supportAccessSessions)
      .innerJoin(authSessions, eq(authSessions.id, supportAccessSessions.authSessionId))
      .where(eq(supportAccessSessions.id, session.sessionId));
    expect(row!.auth_sessions.expiresAt.toISOString()).toBe(session.endsAt);
    await api(app).get('/tenant/access').set(bearer(renewed.accessToken)).expect(200);

    await revoke(ws.token, view.id).expect(200);
    for (const token of [session.accessToken, renewed.accessToken]) {
      expect(
        (await api(app).get('/tenant/access').set(bearer(token)).expect(401)).body.statusCode,
      ).toBe(401);
      expect((await api(app).get('/account').set(bearer(token)).expect(401)).body.statusCode).toBe(
        401,
      );
    }
    await refresh(renewed.refreshToken).expect(401);
    const [ended] = await db
      .select()
      .from(supportAccessSessions)
      .where(eq(supportAccessSessions.id, session.sessionId));
    expect(ended!.endedAt).not.toBeNull();
  });

  it('ends a session when support signs out or ends it from the console', async () => {
    const ws = await workspace();
    const view = await granted(ws.token, { days: 7 });

    const first = await opened(ws.id, view.id);
    await api(app).post('/auth/logout').send({ refreshToken: first.refreshToken }).expect(204);
    expect(
      (await api(app).get('/tenant/access').set(bearer(first.accessToken)).expect(401)).body
        .statusCode,
    ).toBe(401);

    const second = await opened(ws.id, view.id);
    const listed = (
      await api(app).get('/platform/support/access').set(bearer(support.token)).expect(200)
    ).body as PlatformSupportGrantView[];
    expect(listed.find((g) => g.id === view.id)?.openSessions.map((s) => s.id)).toEqual([
      second.sessionId,
    ]);
    await api(app)
      .post(`/platform/support/access/sessions/${second.sessionId}/end`)
      .set(bearer(support.token))
      .expect(204);
    expect(
      (await api(app).get('/tenant/access').set(bearer(second.accessToken)).expect(401)).body
        .statusCode,
    ).toBe(401);
    await refresh(second.refreshToken).expect(401);
    // The grant itself still runs: support may come back.
    await opened(ws.id, view.id);
  });

  it('needs two-step sign-in to open a workspace where admins must use it', async () => {
    const ws = await workspace();
    const view = await granted(ws.token);
    const strict = await bootApp({ REQUIRE_ADMIN_MFA: 'on' });
    try {
      const token = support.token; // A real password-only session from the same database.
      const res = await api(strict)
        .post('/platform/support/access/sessions')
        .set(bearer(token))
        .send({ tenantId: ws.id, grantId: view.id })
        .expect(403);
      expect(res.body.code).toBe('mfa_required');
    } finally {
      await strict.close();
    }
  });
});
