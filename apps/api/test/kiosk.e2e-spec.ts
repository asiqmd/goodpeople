import { randomUUID } from 'node:crypto';
import {
  createDb,
  employees,
  kioskPinCodes,
  notificationDeliveries,
  plans,
  runAsTenant,
  tenantAuditLog,
  tenants,
  type Database,
} from '@gp/db';
import {
  addDays,
  KIOSK_SESSION_HEADER,
  todayIn,
  type KioskCreated,
  type KioskDeviceView,
  type KioskMeView,
  type KioskPinRequestResult,
  type KioskSession,
  type KioskView,
  type LeaveRequestView,
  type PayGroupView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../src/config.js';
import {
  SMS_SENDER,
  type LogSender,
  type SmsMessage,
} from '../src/modules/notifications/senders.js';
import { leaveTypeId, NEXT_YEAR, rahima, workingSpan } from './leave-helpers.js';
import { binary, isPdf, payrollKit } from './payroll-helpers.js';
import { api, bearer, bootApp, platformToken, testEnv, uniqueSlug } from './test-env.js';

// Workers hired by payrollKit all have the mobile number 01812345678.
const PHONE = '+8801812345678';
const monthOf = (date: string) => date.slice(0, 7);
const device = (token: string) => ({ authorization: `Bearer ${token}` });
const session = (kioskToken: string, sessionToken: string) => ({
  ...device(kioskToken),
  [KIOSK_SESSION_HEADER]: sessionToken,
});

describe('kiosks', () => {
  let app: INestApplication;
  let db: Database;
  let pool: ReturnType<typeof createDb>['pool'];
  let kit: Awaited<ReturnType<typeof payrollKit>>;
  let sms: LogSender<SmsMessage>;
  let config: AppConfig;
  let platform: string;
  let tenantId: string;
  let payGroup: PayGroupView;
  let seq = 0;

  beforeAll(async () => {
    app = await bootApp();
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 1 }));
    kit = await payrollKit(app);
    sms = app.get(SMS_SENDER);
    config = app.get(APP_CONFIG);
    platform = await platformToken(app);
    const [myGroup] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    tenantId = myGroup!.id;
    payGroup = await kit.group();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const site = (code = 'GZP') => kit.org.locations.find((l) => l.code === code)!.id;
  async function newKiosk(token = kit.admin, locationId = site()): Promise<KioskCreated> {
    seq += 1;
    return (
      await api(app)
        .post('/tenant/kiosks')
        .set(bearer(token))
        .send({ name: `Gate ${seq}`, locationId })
        .expect(201)
    ).body;
  }

  const hire = async (options: Parameters<typeof kit.hire>[1] = {}, group = payGroup) =>
    kit.hire(group, options);

  const requestCode = (kioskToken: string, employeeCode: string) =>
    api(app).post('/kiosk/v1/pin/request').set(device(kioskToken)).send({ employeeCode });

  /** Asks for a code and reads it from the SMS that went out. */
  async function smsCode(kioskToken: string, employeeCode: string): Promise<string> {
    const before = sms.sent.length;
    await requestCode(kioskToken, employeeCode).expect(202);
    const message = sms.sent.slice(before).find((m) => m.to === PHONE);
    expect(message).toBeDefined();
    return /\d{6}/.exec(message!.text)![0];
  }

  const setPin = (kioskToken: string, employeeCode: string, code: string, pin: string) =>
    api(app).post('/kiosk/v1/pin').set(device(kioskToken)).send({ employeeCode, code, pin });

  async function withPin(kioskToken: string, employeeCode: string, pin = '2580') {
    await setPin(kioskToken, employeeCode, await smsCode(kioskToken, employeeCode), pin).expect(
      204,
    );
  }

  const signIn = (kioskToken: string, employeeCode: string, pin: string) =>
    api(app).post('/kiosk/v1/sessions').set(device(kioskToken)).send({ employeeCode, pin });

  async function signedIn(kioskToken: string, employeeCode: string, pin = '2580') {
    return (await signIn(kioskToken, employeeCode, pin).expect(201)).body as KioskSession;
  }

  /** A Business trial workspace of its own, with a site, signed in as its admin. */
  async function otherWorkspace() {
    const slug = uniqueSlug('kiosk');
    const created = await api(app)
      .post('/platform/tenants')
      .set(bearer(platform))
      .send({
        name: `Kiosk ${slug}`,
        slug,
        industryTemplate: 'rmg',
        reason: 'Kiosk end-to-end test workspace',
        billingMode: 'trial',
        planCode: 'business',
        accessExpiresAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
        admin: { name: 'Kiosk Admin', email: `admin@${slug}.test`, password: testEnv().password },
      })
      .expect(201);
    const token = (
      await api(app)
        .post('/auth/login')
        .send({ tenant: slug, email: `admin@${slug}.test`, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;
    const entity = await api(app)
      .post('/tenant/legal-entities')
      .set(bearer(token))
      .send({ name: `Kiosk ${slug} Ltd` })
      .expect(201);
    const location = await api(app)
      .post('/tenant/locations')
      .set(bearer(token))
      .send({ legalEntityId: entity.body.id, code: 'F1', name: 'Factory 1', kind: 'factory' })
      .expect(201);
    return { id: created.body.tenant.id as string, token, locationId: location.body.id as string };
  }

  // ── Kiosks (HR) ────────────────────────────────────────────────────────────

  it('creates, lists and revokes kiosks, and refuses revoked or wrong tokens', async () => {
    const kiosk = await newKiosk();
    expect(kiosk.token).toMatch(new RegExp(`^gpk\\.${tenantId}\\.${kiosk.id}\\.`));
    expect(kiosk).toMatchObject({
      location: { id: site(), name: expect.any(String) },
      lastSeenAt: null,
      revokedAt: null,
    });
    expect(kiosk.token.split('.')[3]!.startsWith(kiosk.tokenPrefix)).toBe(true);

    const seen = (await api(app).get('/kiosk/v1/device').set(device(kiosk.token)).expect(200))
      .body as KioskDeviceView;
    expect(seen).toEqual({
      kiosk: { id: kiosk.id, name: kiosk.name, location: kiosk.location },
      workspace: { name: 'My Group', slug: 'my-group' },
      readOnly: false,
    });
    const list = (await api(app).get('/tenant/kiosks').set(bearer(kit.admin)).expect(200))
      .body as KioskView[];
    const listed = list.find((k) => k.id === kiosk.id)!;
    expect(listed.lastSeenAt).not.toBeNull();
    expect(listed).not.toHaveProperty('token');

    // Wrong, borrowed or missing tokens.
    const wrong = `${kiosk.token.slice(0, -1)}${kiosk.token.endsWith('A') ? 'B' : 'A'}`;
    for (const headers of [device(wrong), bearer(kit.admin), {}]) {
      const res = await api(app).get('/kiosk/v1/device').set(headers).expect(401);
      expect(res.body.code).toBe('kiosk_unknown');
    }
    // A kiosk token is not a workspace login either.
    await api(app).get('/tenant/access').set(device(kiosk.token)).expect(401);

    const revoked = (
      await api(app).post(`/tenant/kiosks/${kiosk.id}/revoke`).set(bearer(kit.admin)).expect(201)
    ).body as KioskView;
    expect(revoked.revokedAt).not.toBeNull();
    await api(app).post(`/tenant/kiosks/${kiosk.id}/revoke`).set(bearer(kit.admin)).expect(404);
    const refused = await api(app).get('/kiosk/v1/device').set(device(kiosk.token)).expect(401);
    expect(refused.body.code).toBe('kiosk_unknown');
    await signIn(kiosk.token, 'MG-0001', '2580').expect(401);

    // Only people who manage attendance; a site of this workspace.
    const employeeLogin = await rahima(app);
    await api(app).get('/tenant/kiosks').set(bearer(employeeLogin)).expect(403);
    const badSite = await api(app)
      .post('/tenant/kiosks')
      .set(bearer(kit.admin))
      .send({ name: 'Nowhere', locationId: randomUUID() })
      .expect(400);
    expect(badSite.body.code).toBe('location_not_found');

    const audit = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select({ action: tenantAuditLog.action })
        .from(tenantAuditLog)
        .where(eq(tenantAuditLog.entityId, kiosk.id)),
    );
    expect(audit.map((a) => a.action).toSorted()).toEqual(['kiosk.create', 'kiosk.revoke']);
  });

  it("is a Business feature, and follows the workspace's access", async () => {
    const other = await otherWorkspace();
    const kiosk = await newKiosk(other.token, other.locationId);
    await api(app).get('/kiosk/v1/device').set(device(kiosk.token)).expect(200);

    const setStatus = (status: 'active' | 'read_only' | 'suspended') =>
      db.update(tenants).set({ status }).where(eq(tenants.id, other.id));
    const [growth] = await db.select().from(plans).where(eq(plans.code, 'growth'));
    const [business] = await db.select().from(plans).where(eq(plans.code, 'business'));

    // Read-only: reading and signing in, but no PINs set.
    await setStatus('read_only');
    const readOnly = (await api(app).get('/kiosk/v1/device').set(device(kiosk.token)).expect(200))
      .body as KioskDeviceView;
    expect(readOnly.readOnly).toBe(true);
    expect((await signIn(kiosk.token, 'W-1', '2580').expect(401)).body.code).toBe(
      'kiosk_sign_in_failed',
    );
    expect((await requestCode(kiosk.token, 'W-1').expect(403)).body.code).toBe('tenant_read_only');

    await setStatus('suspended');
    expect(
      (await api(app).get('/kiosk/v1/device').set(device(kiosk.token)).expect(403)).body.code,
    ).toBe('tenant_suspended');

    await setStatus('active');
    await db.update(tenants).set({ planId: growth!.id }).where(eq(tenants.id, other.id));
    try {
      const gated = await api(app).get('/kiosk/v1/device').set(device(kiosk.token)).expect(403);
      expect(gated.body.code).toBe('feature_not_in_plan');
      const staff = await api(app).get('/tenant/kiosks').set(bearer(other.token)).expect(403);
      expect(staff.body.code).toBe('feature_not_in_plan');
    } finally {
      await db.update(tenants).set({ planId: business!.id }).where(eq(tenants.id, other.id));
    }
    await api(app).get('/kiosk/v1/device').set(device(kiosk.token)).expect(200);
  });

  // ── PINs ───────────────────────────────────────────────────────────────────

  it('sets a PIN with a code sent by SMS, which expires and allows five tries', async () => {
    const kiosk = await newKiosk();
    const { employee } = await hire();
    const code = employee.employeeCode;

    const before = sms.sent.length;
    const asked = (await requestCode(kiosk.token, code).expect(202)).body as KioskPinRequestResult;
    expect(asked).toEqual({ sent: true, expiresInSeconds: 600, phoneEnding: '78' });
    const message = sms.sent.slice(before).find((m) => m.to === PHONE)!;
    expect(message.text).toContain('10');
    const first = /\d{6}/.exec(message.text)![0];

    // Unknown codes answer the same, the same way each time, and send nothing.
    const sentBefore = sms.sent.length;
    const unknown = `NOBODY-${seq}`;
    const a = (await requestCode(kiosk.token, unknown).expect(202)).body as KioskPinRequestResult;
    const b = (await requestCode(kiosk.token, unknown).expect(202)).body as KioskPinRequestResult;
    expect(a).toEqual({ sent: true, expiresInSeconds: 600, phoneEnding: expect.any(String) });
    expect(a.phoneEnding).toMatch(/^\d{2}$/);
    expect(b).toEqual(a);
    expect(sms.sent.length).toBe(sentBefore);

    // A PIN anyone would guess first is refused before the code is spent.
    const weak = await setPin(kiosk.token, code, first, '1234').expect(400);
    expect(weak.body.issues[0].path).toBe('pin');

    // Five wrong tries finish the code.
    const wrong = first === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const res = await setPin(kiosk.token, code, wrong, '2580').expect(400);
      expect(res.body.code).toBe('kiosk_code_wrong');
    }
    await setPin(kiosk.token, code, first, '2580').expect(400);

    // A new code works once.
    const second = await smsCode(kiosk.token, code.toLowerCase());
    await setPin(kiosk.token, code, second, '2580').expect(204);
    await setPin(kiosk.token, code, second, '2468').expect(400);
    await signedIn(kiosk.token, code, '2580');

    // After ten minutes a code is no longer good.
    const third = await smsCode(kiosk.token, code);
    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(kioskPinCodes)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(kioskPinCodes.employeeId, employee.id)),
    );
    await setPin(kiosk.token, code, third, '2468').expect(400);

    // Three codes per worker per quarter hour.
    const limited = await requestCode(kiosk.token, code).expect(429);
    expect(limited.body.code).toBe('too_many_attempts');

    // The delivery log keeps the messages, not the codes.
    const log = await runAsTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.recipient, PHONE),
            eq(notificationDeliveries.event, 'auth.otp'),
          ),
        ),
    );
    expect(log.length).toBeGreaterThan(0);
    for (const row of log) {
      expect(row).toMatchObject({ channel: 'sms', status: 'sent' });
      for (const sent of [first, second, third]) expect(row.body).not.toContain(sent);
    }
    const [pinned] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(employees).where(eq(employees.id, employee.id)),
    );
    expect(pinned!.kioskPinHash).toMatch(/^\$argon2id\$/);
  });

  // ── Signing in ─────────────────────────────────────────────────────────────

  it('signs a worker in with the card code and PIN, and locks after five wrong PINs', async () => {
    const kiosk = await newKiosk();
    const second = await newKiosk();
    const { employee } = await hire();
    const code = employee.employeeCode;

    // No PIN yet, or nobody: the same refusal.
    expect((await signIn(kiosk.token, code, '2580').expect(401)).body.code).toBe(
      'kiosk_sign_in_failed',
    );
    expect((await signIn(kiosk.token, 'NOBODY', '2580').expect(401)).body.code).toBe(
      'kiosk_sign_in_failed',
    );

    await withPin(kiosk.token, code);
    const started = await signedIn(kiosk.token, code.toLowerCase());
    expect(started).toEqual({
      sessionToken: expect.any(String),
      expiresInSeconds: 180,
      employee: { code, name: employee.fullName, nameBn: null },
    });

    for (let i = 0; i < 4; i++) {
      const res = await signIn(kiosk.token, code, '1357').expect(401);
      expect(res.body.code).toBe('kiosk_sign_in_failed');
    }
    const fifth = await signIn(kiosk.token, code, '1357').expect(429);
    expect(fifth.body).toMatchObject({ code: 'kiosk_locked', retryAfterSeconds: 900 });
    // Locked at every kiosk, even with the right PIN.
    expect((await signIn(second.token, code, '2580').expect(429)).body.code).toBe('kiosk_locked');

    // Proving the phone again with a new PIN lifts the lock.
    await withPin(second.token, code, '9630');
    await signedIn(second.token, code, '9630');
    await signIn(second.token, code, '2580').expect(401);
  });

  // ── The worker's screen ────────────────────────────────────────────────────

  it("shows the worker's day, month, leave and payslips, and applies for leave", async () => {
    const kiosk = await newKiosk();
    const group = await kit.group();
    const worker = await hire({ login: true }, group);
    const other = await hire({}, group);
    const code = worker.employee.employeeCode;

    // Last month's payslips, published.
    const month = monthOf(addDays(`${monthOf(todayIn())}-01`, -1));
    const run = await kit.run(group, month);
    await kit.compute(run.id);
    await kit.lock(run.id);
    await api(app)
      .post(`/tenant/payroll/runs/${run.id}/publish`)
      .set(bearer(kit.admin))
      .expect(200);
    const items = await kit.items(run.id);
    const mine = items.find((i) => i.employee.id === worker.employee.id)!;
    const theirs = items.find((i) => i.employee.id === other.employee.id)!;

    await withPin(kiosk.token, code);
    const { sessionToken } = await signedIn(kiosk.token, code);
    const me = (
      await api(app).get('/kiosk/v1/me').set(session(kiosk.token, sessionToken)).expect(200)
    ).body as KioskMeView;
    const designation = kit.org.designations.find((d) => d.code === 'SO')!;
    const line = kit.org.orgUnits.find((u) => u.code === 'MGT-L1')!;
    expect(me.employee).toEqual({
      code,
      name: worker.employee.fullName,
      nameBn: null,
      designation: designation.name,
      designationBn: designation.nameBn,
      line: line.name,
      lineBn: line.nameBn,
    });
    expect(me.workspace).toEqual({ name: 'My Group', slug: 'my-group' });
    expect(me.today).toMatchObject({ punches: [], status: expect.any(String) });
    expect(me.month).toMatchObject({ from: `${monthOf(todayIn())}-01`, to: todayIn() });
    expect(me.month!.present + me.month!.absent).toBeGreaterThanOrEqual(0);
    expect(me.leave!.map((b) => b.leaveType.code)).toContain('CL');
    expect(me.leave!.every((b) => b.available !== null)).toBe(true);
    expect(me.payslips).toEqual([
      expect.objectContaining({ itemId: mine.id, net: mine.net, periodStart: `${month}-01` }),
    ]);

    // Leave, with self-service's checks and approvals.
    const casual = await leaveTypeId(app, worker.token!, 'CL');
    const span = await workingSpan(app, worker.token!, casual, `${NEXT_YEAR}-02-01`, 1);
    const applied = (
      await api(app)
        .post('/kiosk/v1/leave')
        .set(session(kiosk.token, sessionToken))
        .send({ leaveTypeId: casual, ...span, reason: 'Family visit' })
        .expect(201)
    ).body as LeaveRequestView;
    expect(applied).toMatchObject({
      employee: { id: worker.employee.id },
      days: 1,
      status: expect.stringMatching(/pending|approved/),
    });
    const twice = await api(app)
      .post('/kiosk/v1/leave')
      .set(session(kiosk.token, sessionToken))
      .send({ leaveTypeId: casual, ...span, reason: 'Family visit' })
      .expect(400);
    expect(twice.body.code).toBe('leave_not_allowed');
    // The worker sees it as their own request.
    const theirRequests = (
      await api(app).get('/tenant/me/leave/requests').set(bearer(worker.token!)).expect(200)
    ).body as LeaveRequestView[];
    expect(theirRequests.map((r) => r.id)).toContain(applied.id);

    // Their own payslip, in either language; nobody else's.
    for (const language of ['bn', 'en']) {
      const pdf = await binary(
        api(app)
          .get(`/kiosk/v1/payslips/${mine.id}/pdf?language=${language}`)
          .set(session(kiosk.token, sessionToken)),
      ).expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(isPdf(pdf.body as Buffer)).toBe(true);
    }
    await api(app)
      .get(`/kiosk/v1/payslips/${theirs.id}/pdf`)
      .set(session(kiosk.token, sessionToken))
      .expect(404);
    const noSession = await api(app)
      .get(`/kiosk/v1/payslips/${mine.id}/pdf`)
      .set(device(kiosk.token))
      .expect(401);
    expect(noSession.body.code).toBe('kiosk_session_ended');

    // "Done" ends the session.
    await api(app)
      .post('/kiosk/v1/sessions/end')
      .set(session(kiosk.token, sessionToken))
      .expect(204);
    await api(app).get('/kiosk/v1/me').set(session(kiosk.token, sessionToken)).expect(401);
  });

  it('refuses expired, forged and borrowed sessions', async () => {
    const kiosk = await newKiosk();
    const second = await newKiosk();
    const { employee } = await hire();
    await withPin(kiosk.token, employee.employeeCode);
    const { sessionToken } = await signedIn(kiosk.token, employee.employeeCode);
    await api(app).get('/kiosk/v1/me').set(session(kiosk.token, sessionToken)).expect(200);

    const jwt = new JwtService();
    const now = Math.floor(Date.now() / 1000);
    const claims = { typ: 'kiosk', sub: employee.id, tid: tenantId, kid: kiosk.id };
    const expired = await jwt.signAsync(
      { ...claims, jti: randomUUID(), iat: now - 600, exp: now - 400 },
      { secret: config.JWT_ACCESS_SECRET },
    );
    const forged = await jwt.signAsync(
      { ...claims, jti: randomUUID() },
      { secret: 'not-the-secret-of-this-server-at-all', expiresIn: 180 },
    );
    const untyped = await jwt.signAsync(
      { sub: employee.id, tid: tenantId, kid: kiosk.id, jti: randomUUID() },
      { secret: config.JWT_ACCESS_SECRET, expiresIn: 180 },
    );
    for (const token of [expired, forged, untyped, kit.admin, 'nonsense', '']) {
      const res = await api(app).get('/kiosk/v1/me').set(session(kiosk.token, token)).expect(401);
      expect(res.body.code).toBe('kiosk_session_ended');
    }
    // Another kiosk's session, or the session as a workspace login.
    await api(app).get('/kiosk/v1/me').set(session(second.token, sessionToken)).expect(401);
    await api(app).get('/tenant/access').set(bearer(sessionToken)).expect(401);
  });

  it("keeps workspaces apart: another workspace's kiosk cannot sign in this one's workers", async () => {
    const kiosk = await newKiosk();
    const other = await otherWorkspace();
    const foreign = await newKiosk(other.token, other.locationId);
    const { employee } = await hire();
    await withPin(kiosk.token, employee.employeeCode);

    expect((await signIn(foreign.token, employee.employeeCode, '2580').expect(401)).body.code).toBe(
      'kiosk_sign_in_failed',
    );
    const before = sms.sent.length;
    await requestCode(foreign.token, employee.employeeCode).expect(202);
    expect(sms.sent.length).toBe(before);

    const { sessionToken } = await signedIn(kiosk.token, employee.employeeCode);
    await api(app).get('/kiosk/v1/me').set(session(foreign.token, sessionToken)).expect(401);
    // HR of the other workspace does not see this one's kiosks.
    const theirs = (await api(app).get('/tenant/kiosks').set(bearer(other.token)).expect(200))
      .body as KioskView[];
    expect(theirs.map((k) => k.id)).toEqual([foreign.id]);
    await api(app).post(`/tenant/kiosks/${kiosk.id}/revoke`).set(bearer(other.token)).expect(404);
  });

  it('prints ID cards with the QR code a kiosk scans', async () => {
    const { employee } = await hire();
    const cards = await binary(
      api(app)
        .post('/tenant/id-cards')
        .set(bearer(kit.admin))
        .send({ employeeIds: [employee.id], language: 'bn' }),
    ).expect(200);
    expect(isPdf(cards.body as Buffer)).toBe(true);
  });

  it('refuses a worker who has left, even with a session already open', async () => {
    const kiosk = await newKiosk();
    const { employee } = await hire();
    await withPin(kiosk.token, employee.employeeCode);
    const { sessionToken } = await signedIn(kiosk.token, employee.employeeCode);

    await runAsTenant(db, tenantId, (tx) =>
      tx
        .update(employees)
        .set({ status: 'separated', separatedOn: addDays(todayIn(), -1) })
        .where(eq(employees.id, employee.id)),
    );

    const open = await api(app).get('/kiosk/v1/me').set(session(kiosk.token, sessionToken));
    expect(open.status).toBe(403);
    expect(open.body.code).toBe('kiosk_employee_inactive');
    expect((await signIn(kiosk.token, employee.employeeCode, '2580').expect(403)).body.code).toBe(
      'kiosk_employee_inactive',
    );
    // A wrong PIN still says only that it is wrong.
    await signIn(kiosk.token, employee.employeeCode, '1357').expect(401);
    const before = sms.sent.length;
    await requestCode(kiosk.token, employee.employeeCode).expect(202);
    expect(sms.sent.length).toBe(before);
  });
});
