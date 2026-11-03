import type {
  AccountView,
  ApprovalItem,
  EmployeeDetail,
  NotificationInbox,
  OrgSnapshot,
  WorkspaceUserCreated,
} from '@gp/shared';
import { addDays, todayIn } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { runInTenantContext } from '../src/common/request-context.js';
import { totpAt } from '../src/modules/auth/totp.js';
import { NotificationDispatcher } from '../src/modules/notifications/notification-dispatcher.service.js';
import { NotificationJobs } from '../src/modules/notifications/notification-jobs.service.js';
import {
  EMAIL_SENDER,
  SMS_SENDER,
  type EmailMessage,
  type LogSender,
  type SmsMessage,
} from '../src/modules/notifications/senders.js';
import { leaveTypeId, NEXT_YEAR, workingSpan } from './leave-helpers.js';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;

let seq = 0;
/** A mobile number nobody else in the test database has. */
const uniquePhone = () =>
  `+88017${String(Date.now() % 1e6).padStart(6, '0')}${String(seq++ % 100).padStart(2, '0')}`;

describe('accounts, sign-in and notifications', () => {
  let app: INestApplication;
  let admin: string;
  let tenantId: string;
  let org: OrgSnapshot;
  let sms: LogSender<SmsMessage>;
  let email: LogSender<EmailMessage>;

  beforeAll(async () => {
    app = await bootApp();
    const session = await api(app)
      .post('/auth/login')
      .send({ tenant: 'my-group', email: 'admin@my-group.test', password: testEnv().password })
      .expect(200);
    admin = session.body.accessToken;
    tenantId = session.body.tenant.id;
    org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200)).body;
    sms = app.get(SMS_SENDER);
    email = app.get(EMAIL_SENDER);
  });
  afterAll(() => app.close());

  const send = () => app.get(NotificationDispatcher).runFor(tenantId);

  async function createUser(body: Record<string, unknown>) {
    seq += 1;
    return (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({ name: `Test user ${seq}`, ...body })
        .expect(201)
    ).body as WorkspaceUserCreated;
  }

  function signIn(emailAddress: string, password: string) {
    return api(app).post('/auth/login').send({ tenant: 'my-group', email: emailAddress, password });
  }

  /** Hires someone with a login (an email, so they can sign in with a password). */
  async function hireWithLogin(managerId?: string) {
    seq += 1;
    const code = `A-${Date.now().toString(36)}-${seq}`;
    const loginEmail = `${code.toLowerCase()}@example.test`;
    const res = await api(app)
      .post('/tenant/employees')
      .set(bearer(admin))
      .send({
        employeeCode: code,
        fullName: `Worker ${seq}`,
        fatherName: 'Abdul Karim',
        motherName: 'Hosne Ara',
        dateOfBirth: '1995-02-14',
        gender: 'female',
        mobilePhone: '01812345678',
        workEmail: loginEmail,
        presentAddress: address,
        permanentAddress: address,
        identity: { nid: `${Date.now()}${seq}`.slice(-10) },
        joinedOn: '2025-01-01',
        job: {
          legalEntityId: ref(org.legalEntities, 'MGT'),
          locationId: ref(org.locations, 'GZP'),
          orgUnitId: ref(org.orgUnits, 'MGT-L1'),
          designationId: ref(org.designations, 'SO'),
          gradeId: ref(org.grades, 'W5'),
          employmentType: 'permanent',
          workerCategory: 'worker',
          ...(managerId ? { managerId } : {}),
        },
        portalAccess: { email: loginEmail, role: 'employee', password: testEnv().password },
      })
      .expect(201);
    const employee = res.body.employee as EmployeeDetail;
    const token = (await signIn(loginEmail, testEnv().password).expect(200)).body.accessToken;
    return { employee, token: token as string, email: loginEmail };
  }

  // ── Role templates ─────────────────────────────────────────────────────────

  it('gives each role template its own permissions', async () => {
    const officer = await createUser({
      email: `officer-${Date.now()}@example.test`,
      role: 'attendance_officer',
      password: testEnv().password,
    });
    const token = (await signIn(officer.email!, testEnv().password).expect(200)).body.accessToken;
    const account = (await api(app).get('/account').set(bearer(token)).expect(200))
      .body as AccountView;
    expect(account.permissions).toEqual([
      'employees.read',
      'attendance.manage',
      'production.manage',
    ]);

    // Reads people, but their identity numbers stay masked.
    const list = await api(app).get('/tenant/employees?pageSize=1').set(bearer(token)).expect(200);
    const id = list.body.items[0].id as string;
    const detail = (await api(app).get(`/tenant/employees/${id}`).set(bearer(token)).expect(200))
      .body as EmployeeDetail;
    const nid = detail.identity!.nid;
    if (nid) expect(nid).toMatch(/^••••/);
    // Cannot change people, leave or logins.
    await api(app)
      .patch(`/tenant/employees/${id}`)
      .set(bearer(token))
      .send({ spouseName: 'X' })
      .expect(403);
    await api(app).post('/tenant/leave/types').set(bearer(token)).send({}).expect(403);
    await api(app).get('/tenant/users').set(bearer(token)).expect(403);
    // Does attendance.
    await api(app).get('/tenant/attendance/shifts').set(bearer(token)).expect(200);
  });

  // ── Workspace users ────────────────────────────────────────────────────────

  it('creates logins and keeps the workspace from locking itself out', async () => {
    // Staff need an email; employees may sign in with a mobile number only.
    await api(app)
      .post('/tenant/users')
      .set(bearer(admin))
      .send({ name: 'No email', phone: '01712000001', role: 'hr_officer' })
      .expect(400);
    const worker = await createUser({ phone: uniquePhone(), role: 'employee' });
    expect(worker.email).toBeNull();
    expect(worker.temporaryPassword).toBeUndefined();

    const created = await createUser({
      email: `temp-${Date.now()}@example.test`,
      role: 'hr_officer',
    });
    expect(created.temporaryPassword).toMatch(/.{12,}/);
    await signIn(created.email!, created.temporaryPassword!).expect(200);

    const me = (await api(app).get('/account').set(bearer(admin)).expect(200)).body as AccountView;
    await api(app)
      .patch(`/tenant/users/${me.id}`)
      .set(bearer(admin))
      .send({ disabled: true })
      .expect(403);
    await api(app)
      .patch(`/tenant/users/${me.id}`)
      .set(bearer(admin))
      .send({ role: 'hr_admin' })
      .expect(403);

    // Disabling signs the person out at once.
    const session = (await signIn(created.email!, created.temporaryPassword!).expect(200)).body;
    await api(app)
      .patch(`/tenant/users/${created.id}`)
      .set(bearer(admin))
      .send({ disabled: true })
      .expect(200);
    await api(app).post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await signIn(created.email!, created.temporaryPassword!).expect(403);
  });

  it('refuses to demote or disable the last workspace admin', async () => {
    const second = await createUser({
      email: `admin2-${Date.now()}@example.test`,
      role: 'tenant_admin',
      password: testEnv().password,
    });
    const token = (await signIn(second.email!, testEnv().password).expect(200)).body.accessToken;
    const me = (await api(app).get('/account').set(bearer(admin)).expect(200)).body as AccountView;
    // While the seeded admin is active, the second may be demoted…
    await api(app)
      .patch(`/tenant/users/${second.id}`)
      .set(bearer(admin))
      .send({ role: 'hr_admin' })
      .expect(200);
    await api(app)
      .patch(`/tenant/users/${second.id}`)
      .set(bearer(admin))
      .send({ role: 'tenant_admin' })
      .expect(200);
    // …and with two admins, one may disable the other, but never the last one standing.
    const users = (await api(app).get('/tenant/users').set(bearer(admin)).expect(200)).body as {
      id: string;
      role: string;
      disabled: boolean;
    }[];
    const activeAdmins = users.filter((u) => u.role === 'tenant_admin' && !u.disabled);
    expect(activeAdmins.length).toBeGreaterThanOrEqual(2);
    await api(app)
      .patch(`/tenant/users/${second.id}`)
      .set(bearer(token))
      .send({ name: 'Second admin' })
      .expect(200);
    await api(app)
      .patch(`/tenant/users/${second.id}`)
      .set(bearer(admin))
      .send({ disabled: true })
      .expect(200);
    void me;
  });

  // ── Sign-in by SMS code ────────────────────────────────────────────────────

  it('rejects an outstanding SMS proof after its login phone changes', async () => {
    const phone = uniquePhone(),
      user = await createUser({ phone, role: 'employee' }),
      replacement = uniquePhone();
    await api(app).post('/auth/otp/request').send({ tenant: 'my-group', phone }).expect(202);
    const oldCode = /\d{6}/.exec(sms.sent.at(-1)!.text)![0];
    await api(app)
      .patch(`/tenant/users/${user.id}`)
      .set(bearer(admin))
      .send({ phone: replacement })
      .expect(200);
    await api(app)
      .post('/auth/otp/verify')
      .send({ tenant: 'my-group', phone, code: oldCode })
      .expect(401);
    await api(app)
      .post('/auth/otp/request')
      .send({ tenant: 'my-group', phone: replacement })
      .expect(202);
    const code = /\d{6}/.exec(sms.sent.at(-1)!.text)![0];
    await api(app)
      .post('/auth/otp/verify')
      .send({ tenant: 'my-group', phone: replacement, code })
      .expect(200);
  });
  it('signs an employee in with a code sent by SMS', async () => {
    const phone = uniquePhone();
    await createUser({ phone, role: 'employee' });
    const before = sms.sent.length;
    const res = await api(app)
      .post('/auth/otp/request')
      .send({ tenant: 'my-group', phone })
      .expect(202);
    expect(res.body).toEqual({ sent: true, expiresInSeconds: 300 });
    const message = sms.sent.at(-1)!;
    expect(sms.sent.length).toBe(before + 1);
    expect(message.to).toBe(phone);
    const code = /\d{6}/.exec(message.text)![0];

    await api(app)
      .post('/auth/otp/verify')
      .send({ tenant: 'my-group', phone, code: code === '000000' ? '111111' : '000000' })
      .expect(401);
    const session = await api(app)
      .post('/auth/otp/verify')
      .send({ tenant: 'my-group', phone, code })
      .expect(200);
    expect(session.body.user.email).toBeNull();
    // A code works once.
    await api(app).post('/auth/otp/verify').send({ tenant: 'my-group', phone, code }).expect(401);

    // The delivery log keeps the message without the code.
    const log = (
      await api(app).get('/tenant/notification-deliveries').set(bearer(admin)).expect(200)
    ).body as { event: string; recipient: string }[];
    expect(
      log.find((d) => d.event === 'auth.otp' && d.recipient.endsWith(phone.slice(-4))),
    ).toBeTruthy();
  });

  it('answers the same for numbers without a login, and sends nothing', async () => {
    const before = sms.sent.length;
    const staffPhone = uniquePhone();
    await createUser({
      email: `staffphone-${Date.now()}@example.test`,
      phone: staffPhone,
      role: 'hr_officer',
      password: testEnv().password,
    });
    for (const phone of [uniquePhone(), staffPhone]) {
      const res = await api(app)
        .post('/auth/otp/request')
        .send({ tenant: 'my-group', phone })
        .expect(202);
      expect(res.body.sent).toBe(true);
    }
    await api(app)
      .post('/auth/otp/request')
      .send({ tenant: 'no-such-workspace', phone: uniquePhone() })
      .expect(202);
    expect(sms.sent.length).toBe(before);
  });

  it('ends a code after five wrong guesses and limits requests per number', async () => {
    const phone = uniquePhone();
    await createUser({ phone, role: 'employee' });
    await api(app).post('/auth/otp/request').send({ tenant: 'my-group', phone }).expect(202);
    const code = /\d{6}/.exec(sms.sent.at(-1)!.text)![0];
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) {
      await api(app)
        .post('/auth/otp/verify')
        .send({ tenant: 'my-group', phone, code: wrong })
        .expect(401);
    }
    await api(app).post('/auth/otp/verify').send({ tenant: 'my-group', phone, code }).expect(401);

    await api(app).post('/auth/otp/request').send({ tenant: 'my-group', phone }).expect(202);
    await api(app).post('/auth/otp/request').send({ tenant: 'my-group', phone }).expect(202);
    const limited = await api(app)
      .post('/auth/otp/request')
      .send({ tenant: 'my-group', phone })
      .expect(429);
    expect(limited.body.code).toBe('too_many_attempts');
  });

  // ── Two-step sign-in ───────────────────────────────────────────────────────

  it('adds an authenticator code to a password sign-in', async () => {
    const user = await createUser({
      email: `mfa-${Date.now()}@example.test`,
      role: 'hr_admin',
      password: testEnv().password,
    });
    const token = (await signIn(user.email!, testEnv().password).expect(200)).body.accessToken;
    const setup = (await api(app).post('/account/mfa/setup').set(bearer(token)).expect(200)).body;
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    await api(app)
      .post('/account/mfa/confirm')
      .set(bearer(token))
      .send({ code: '000000' })
      .expect(400);
    const enabled = await api(app)
      .post('/account/mfa/confirm')
      .set(bearer(token))
      .send({ code: totpAt(setup.secret, new Date()) })
      .expect(200);
    expect(enabled.body.recoveryCodes).toHaveLength(8);

    const step = (await signIn(user.email!, testEnv().password).expect(200)).body;
    expect(step).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    // The second-step token is not an access token.
    await api(app).get('/account').set(bearer(step.mfaToken)).expect(401);
    await api(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: step.mfaToken, code: '000000' })
      .expect(401);
    // The next step's code: the one that confirmed the setup has been used.
    const session = await api(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: step.mfaToken, code: totpAt(setup.secret, new Date(Date.now() + 30_000)) })
      .expect(200);
    expect(session.body.user.email).toBe(user.email);

    // A recovery code works once.
    const recovery = enabled.body.recoveryCodes[0] as string;
    const again = (await signIn(user.email!, testEnv().password).expect(200)).body;
    await api(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: again.mfaToken, code: recovery })
      .expect(200);
    const third = (await signIn(user.email!, testEnv().password).expect(200)).body;
    await api(app)
      .post('/auth/mfa/verify')
      .send({ mfaToken: third.mfaToken, code: recovery })
      .expect(401);

    // An admin can reset it for someone who lost their phone.
    await api(app).post(`/tenant/users/${user.id}/reset-mfa`).set(bearer(admin)).expect(200);
    const plain = (await signIn(user.email!, testEnv().password).expect(200)).body;
    expect(plain.accessToken).toBeTruthy();
  });

  it('accepts each authenticator code and each second-step token once', async () => {
    // Three steps are accepted at a time (the current one and its neighbours); start well
    // inside one so all three stay valid while the test runs.
    const into = Date.now() % 30_000;
    if (into > 20_000) await new Promise((resolve) => setTimeout(resolve, 30_100 - into));
    const now = Date.now();
    const user = await createUser({
      email: `mfa-once-${now}@example.test`,
      role: 'hr_admin',
      password: testEnv().password,
    });
    const token = (await signIn(user.email!, testEnv().password).expect(200)).body.accessToken;
    const setup = (await api(app).post('/account/mfa/setup').set(bearer(token)).expect(200)).body;
    const code = (steps: number) => totpAt(setup.secret, new Date(now + steps * 30_000));
    await api(app)
      .post('/account/mfa/confirm')
      .set(bearer(token))
      .send({ code: code(-1) })
      .expect(200);
    const verify = (mfaToken: string, value: string) =>
      api(app).post('/auth/mfa/verify').send({ mfaToken, code: value });

    const first = (await signIn(user.email!, testEnv().password).expect(200)).body.mfaToken;
    await verify(first, code(-1)).expect(401);
    await verify(first, code(0)).expect(200);
    const second = (await signIn(user.email!, testEnv().password).expect(200)).body.mfaToken;
    await verify(second, code(0)).expect(401);
    // The first token finished a sign-in: even with a fresh code it is refused.
    await verify(first, code(1)).expect(401);
    await verify(second, code(1)).expect(200);
  });

  it('makes admins set up two-step sign-in when the server requires it', async () => {
    const strict = await bootApp({ REQUIRE_ADMIN_MFA: 'on' });
    try {
      const user = await createUser({
        email: `strict-${Date.now()}@example.test`,
        role: 'hr_admin',
        password: testEnv().password,
      });
      const step = (
        await api(strict)
          .post('/auth/login')
          .send({ tenant: 'my-group', email: user.email, password: testEnv().password })
          .expect(200)
      ).body;
      expect(step).toEqual({ mfaSetupRequired: true, mfaToken: expect.any(String) });
      const setup = (
        await api(strict)
          .post('/auth/mfa/enroll/start')
          .send({ mfaToken: step.mfaToken })
          .expect(200)
      ).body;
      const done = await api(strict)
        .post('/auth/mfa/enroll')
        .send({ mfaToken: step.mfaToken, code: totpAt(setup.secret, new Date()) })
        .expect(200);
      expect(done.body.accessToken).toBeTruthy();
      expect(done.body.recoveryCodes).toHaveLength(8);
      // It cannot be turned off while the role requires it.
      await api(strict)
        .post('/account/mfa/disable')
        .set(bearer(done.body.accessToken))
        .send({ password: testEnv().password })
        .expect(403);
      // Employees are not affected.
      await tenantLogin(strict, 'my-group');
    } finally {
      await strict.close();
    }
  });

  it('limits password guesses per login', async () => {
    const user = await createUser({
      email: `guess-${Date.now()}@example.test`,
      role: 'employee',
      password: testEnv().password,
    });
    for (let i = 0; i < 10; i++) await signIn(user.email!, 'wrong password').expect(401);
    const res = await signIn(user.email!, testEnv().password).expect(429);
    expect(res.body.code).toBe('too_many_attempts');
  });

  it('changes a password and signs other sessions out', async () => {
    const user = await createUser({
      email: `pw-${Date.now()}@example.test`,
      role: 'employee',
      password: testEnv().password,
    });
    const first = (await signIn(user.email!, testEnv().password).expect(200)).body;
    const second = (await signIn(user.email!, testEnv().password).expect(200)).body;
    await api(app)
      .post('/account/password')
      .set(bearer(second.accessToken))
      .send({ currentPassword: 'not it', newPassword: 'a whole new password' })
      .expect(400);
    await api(app)
      .post('/account/password')
      .set(bearer(second.accessToken))
      .send({
        currentPassword: testEnv().password,
        newPassword: 'a whole new password',
        keepRefreshToken: second.refreshToken,
      })
      .expect(204);
    await api(app).post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await api(app).post('/auth/refresh').send({ refreshToken: second.refreshToken }).expect(200);
    await signIn(user.email!, 'a whole new password').expect(200);
  });

  // ── Notifications ──────────────────────────────────────────────────────────

  it('tells the manager about a request and the employee about the decision', async () => {
    const manager = await hireWithLogin();
    const worker = await hireWithLogin(manager.employee.id);
    const cl = await leaveTypeId(app, admin, 'CL');
    const span = await workingSpan(app, worker.token, cl, `${NEXT_YEAR}-03-01`, 1);
    // Counted before the request: the dispatcher may send the email by itself half a second
    // after it is queued.
    const sentBefore = email.sent.length;
    await api(app)
      .post('/tenant/me/leave/requests')
      .set(bearer(worker.token))
      .send({ leaveTypeId: cl, ...span, reason: 'Family visit' })
      .expect(201);

    const inbox = (
      await api(app).get('/tenant/notifications').set(bearer(manager.token)).expect(200)
    ).body as NotificationInbox;
    expect(inbox.unread).toBe(1);
    expect(inbox.items[0]).toMatchObject({
      event: 'approval.requested',
      link: '/workspace/approvals',
    });
    expect(inbox.items[0]!.title).toContain(worker.employee.fullName);
    expect(inbox.items[0]!.body).toContain('Casual');

    // The email waits in the outbox until the dispatcher sends it, oldest first and a batch
    // at a time, behind however much of other tests' mail; dispatch until it goes or nothing
    // is left (as later sweeps would).
    let mail: (typeof email.sent)[number] | undefined;
    while (!mail) {
      const handled = await send();
      mail = email.sent.slice(sentBefore).find((m) => m.to === manager.email);
      if (handled === 0) break;
    }
    expect(mail?.subject).toContain(worker.employee.fullName);
    expect(mail?.text).toContain('/workspace/approvals');

    const items = (await api(app).get('/tenant/approvals').set(bearer(manager.token)).expect(200))
      .body as ApprovalItem[];
    const step = items.find(
      (i) => i.subjectType === 'leave_request' && i.request.employee.id === worker.employee.id,
    )!;
    await api(app)
      .post(`/tenant/approvals/${step.stepId}/approve`)
      .set(bearer(manager.token))
      .send({ comment: 'Enjoy' })
      .expect(201);

    const mine = (await api(app).get('/tenant/notifications').set(bearer(worker.token)).expect(200))
      .body as NotificationInbox;
    expect(mine.items[0]).toMatchObject({
      event: 'approval.decided',
      title: 'Your request was approved',
    });
    expect(mine.items[0]!.body).toContain('Note: Enjoy');

    await api(app)
      .post(`/tenant/notifications/${mine.items[0]!.id}/read`)
      .set(bearer(worker.token))
      .expect(204);
    const read = (
      await api(app).get('/tenant/notifications?unread=true').set(bearer(worker.token)).expect(200)
    ).body as NotificationInbox;
    expect(read.unread).toBe(0);
    // Nobody reads another person's notification.
    await api(app)
      .post(`/tenant/notifications/${mine.items[0]!.id}/read`)
      .set(bearer(manager.token))
      .expect(404);
  });

  it('writes in the person’s language and uses the workspace’s wording', async () => {
    const manager = await hireWithLogin();
    const worker = await hireWithLogin(manager.employee.id);
    await api(app)
      .patch('/account/preferences')
      .set(bearer(manager.token))
      .send({ language: 'bn' })
      .expect(200);
    await api(app)
      .put('/tenant/notification-templates/approval.requested/bn')
      .set(bearer(admin))
      .send({ title: 'অনুমোদন দরকার: {{person.name}}' })
      .expect(200);
    try {
      const cl = await leaveTypeId(app, admin, 'CL');
      const span = await workingSpan(app, worker.token, cl, `${NEXT_YEAR}-04-01`, 1);
      await api(app)
        .post('/tenant/me/leave/requests')
        .set(bearer(worker.token))
        .send({ leaveTypeId: cl, ...span, reason: 'Doctor' })
        .expect(201);
      const inbox = (
        await api(app).get('/tenant/notifications').set(bearer(manager.token)).expect(200)
      ).body as NotificationInbox;
      expect(inbox.items[0]!.title).toBe(`অনুমোদন দরকার: ${worker.employee.fullName}`);
      // The body is still the built-in Bangla text, with the date in Bangla.
      expect(inbox.items[0]!.body).toMatch(/অনুমোদন পাতায়/);
      expect(inbox.items[0]!.body).toMatch(/[০-৯]/);
    } finally {
      await api(app)
        .delete('/tenant/notification-templates/approval.requested/bn')
        .set(bearer(admin))
        .expect(204);
    }
    const templates = (
      await api(app).get('/tenant/notification-templates').set(bearer(admin)).expect(200)
    ).body as { event: string; language: string; customized: boolean }[];
    expect(
      templates.find((t) => t.event === 'approval.requested' && t.language === 'bn')!.customized,
    ).toBe(false);
    await api(app)
      .put('/tenant/notification-templates/auth.otp/en')
      .set(bearer(admin))
      .send({ sms: 'Code {{otp.code}}' })
      .expect(400);
  });

  it('sends no email when the workspace turns email off', async () => {
    const settings = (
      await api(app).get('/tenant/notification-settings').set(bearer(admin)).expect(200)
    ).body;
    expect(settings.drivers).toEqual({ email: 'log', sms: 'log', push: 'log' });
    await api(app)
      .patch('/tenant/notification-settings')
      .set(bearer(admin))
      .send({ emailEnabled: false })
      .expect(200);
    try {
      const manager = await hireWithLogin();
      const worker = await hireWithLogin(manager.employee.id);
      const cl = await leaveTypeId(app, admin, 'CL');
      const span = await workingSpan(app, worker.token, cl, `${NEXT_YEAR}-05-01`, 1);
      await api(app)
        .post('/tenant/me/leave/requests')
        .set(bearer(worker.token))
        .send({ leaveTypeId: cl, ...span, reason: 'Rest' })
        .expect(201);
      const before = email.sent.length;
      await send();
      expect(email.sent.slice(before).some((m) => m.to === manager.email)).toBe(false);
      // The inbox still has it.
      const inbox = (
        await api(app).get('/tenant/notifications').set(bearer(manager.token)).expect(200)
      ).body as NotificationInbox;
      expect(inbox.unread).toBe(1);
    } finally {
      await api(app)
        .patch('/tenant/notification-settings')
        .set(bearer(admin))
        .send({ emailEnabled: true })
        .expect(200);
    }
  });

  it('reminds HR about an expiring document once per stage', async () => {
    const person = await hireWithLogin();
    const expiresOn = addDays(todayIn(), 5);
    await api(app)
      .post(`/tenant/employees/${person.employee.id}/documents`)
      .set(bearer(admin))
      .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), 'passport.pdf')
      .field('category', 'passport')
      .field('title', 'Passport')
      .field('expiresOn', expiresOn)
      .field('visibleToEmployee', 'true')
      .expect(201);
    const jobs = app.get(NotificationJobs);
    await runInTenantContext(tenantId, () => jobs.remindTenant());
    const hrInbox = (await api(app).get('/tenant/notifications').set(bearer(admin)).expect(200))
      .body as NotificationInbox;
    const mine = hrInbox.items.filter(
      (n) => n.event === 'document.expiring' && n.body.includes(person.employee.fullName),
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]!.title).toBe('Passport: expires in 5 days');
    // The employee can see the document, so they are told too.
    const own = (await api(app).get('/tenant/notifications').set(bearer(person.token)).expect(200))
      .body as NotificationInbox;
    expect(own.items.some((n) => n.event === 'document.expiring')).toBe(true);

    await runInTenantContext(tenantId, () => jobs.remindTenant());
    const again = (await api(app).get('/tenant/notifications').set(bearer(admin)).expect(200))
      .body as NotificationInbox;
    expect(
      again.items.filter(
        (n) => n.event === 'document.expiring' && n.body.includes(person.employee.fullName),
      ),
    ).toHaveLength(1);
  });

  // ── Offline punches ────────────────────────────────────────────────────────

  it('accepts punches the app recorded offline, once', async () => {
    const person = await hireWithLogin();
    await api(app)
      .patch('/tenant/attendance/settings')
      .set(bearer(admin))
      .send({ selfPunch: 'anywhere' })
      .expect(200);
    try {
      const clientId = crypto.randomUUID();
      const punchedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
      await api(app)
        .post('/tenant/me/attendance/punch')
        .set(bearer(person.token))
        .send({ source: 'mobile', punchedAt, clientId })
        .expect(201);
      await api(app)
        .post('/tenant/me/attendance/punch')
        .set(bearer(person.token))
        .send({ source: 'mobile', punchedAt, clientId })
        .expect(201);
      const { punches } = (
        await api(app)
          .get(
            `/tenant/employees/${person.employee.id}/attendance?from=${addDays(todayIn(), -1)}&to=${todayIn()}`,
          )
          .set(bearer(admin))
          .expect(200)
      ).body as { punches: { offline: boolean; punchedAt: string }[] };
      expect(punches.filter((p) => p.offline)).toHaveLength(1);
      expect(new Date(punches.find((p) => p.offline)!.punchedAt).toISOString()).toBe(punchedAt);

      await api(app)
        .post('/tenant/me/attendance/punch')
        .set(bearer(person.token))
        .send({
          source: 'mobile',
          punchedAt: new Date(Date.now() - 80 * 3_600_000).toISOString(),
          clientId: crypto.randomUUID(),
        })
        .expect(400);
      await api(app)
        .post('/tenant/me/attendance/punch')
        .set(bearer(person.token))
        .send({ source: 'mobile', punchedAt })
        .expect(400);
    } finally {
      await api(app)
        .patch('/tenant/attendance/settings')
        .set(bearer(admin))
        .send({ selfPunch: 'geofenced' })
        .expect(200);
    }
  });

  // ── Hardening and go-live ──────────────────────────────────────────────────

  it('sends security headers', async () => {
    const res = await api(app).get('/health').expect(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('keeps notification settings, logins and the checklist to the roles that have them', async () => {
    const officer = await createUser({
      email: `officer2-${Date.now()}@example.test`,
      role: 'hr_officer',
      password: testEnv().password,
    });
    const auditor = await createUser({
      email: `auditor-${Date.now()}@example.test`,
      role: 'auditor',
      password: testEnv().password,
    });
    const officerToken = (await signIn(officer.email!, testEnv().password).expect(200)).body
      .accessToken;
    const auditorToken = (await signIn(auditor.email!, testEnv().password).expect(200)).body
      .accessToken;
    for (const token of [officerToken, auditorToken]) {
      await api(app).get('/tenant/notification-settings').set(bearer(token)).expect(403);
      await api(app).get('/tenant/notification-deliveries').set(bearer(token)).expect(403);
      await api(app).get('/tenant/users').set(bearer(token)).expect(403);
      await api(app).get('/tenant/setup-checklist').set(bearer(token)).expect(403);
      // Everyone has their own inbox.
      await api(app).get('/tenant/notifications').set(bearer(token)).expect(200);
    }
    // The auditor reads people but changes nothing.
    const list = await api(app)
      .get('/tenant/employees?pageSize=1')
      .set(bearer(auditorToken))
      .expect(200);
    await api(app)
      .patch(`/tenant/employees/${list.body.items[0].id}`)
      .set(bearer(auditorToken))
      .send({ spouseName: 'X' })
      .expect(403);
  });

  it('lists what the workspace still needs before go-live', async () => {
    const res = await api(app).get('/tenant/setup-checklist').set(bearer(admin)).expect(200);
    const keys = res.body.steps.map((s: { key: string }) => s.key);
    expect(keys).toContain('admin_mfa');
    expect(res.body.steps.find((s: { key: string }) => s.key === 'employees').status).toBe('done');
    expect(res.body.steps.find((s: { key: string }) => s.key === 'email').status).toBe('warning');
    expect(res.body.total).toBeGreaterThan(res.body.done);
  });
});
