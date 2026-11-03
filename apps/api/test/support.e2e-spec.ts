import {
  createDb,
  hashPassword,
  platformUsers,
  supportAccessGrants,
  supportTickets,
  type Database,
} from '@gp/db';
import {
  FIRST_RESPONSE_HOURS,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  type PlanCode,
  type PlatformRole,
  type SupportTicketDetail,
  type SupportTicketSummary,
  type TenantAccessView,
  type WorkspaceUserCreated,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Test } from 'supertest';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type LogSender,
} from '../src/modules/notifications/senders.js';
import { SupportJobs } from '../src/modules/support/support-jobs.service.js';
import { addSupportHours } from '../src/modules/support/support-hours.js';
import { binary } from './payroll-helpers.js';
import { api, bearer, bootApp, platformToken, testEnv, uniqueSlug } from './test-env.js';

const DAY = 86_400_000;
const INBOX = 'support@goodpeople.example';
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('a screenshot'),
]);
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.from([0x90, 0, 3, 0]), Buffer.from('PE')]);

/** The target a ticket should have: its plan's hours for its priority, from its opening. */
const target = (t: SupportTicketDetail, plan: PlanCode, priority: 'normal' | 'urgent') =>
  addSupportHours(new Date(t.createdAt), FIRST_RESPONSE_HOURS[plan][priority]).toISOString();

// Each test makes its own workspaces and logins, so the tests pass in any order.
describe('support tickets', () => {
  let app: INestApplication;
  let db: Database;
  let pool: ReturnType<typeof createDb>['pool'];
  let platform: string;
  let email: LogSender<EmailMessage>;
  let jobs: SupportJobs;
  let seq = 0;
  const stamp = Date.now().toString(36);
  /** A subject nobody else's ticket has. */
  const subject = (what: string) => `${what} ${stamp}-${seq++}`;

  /** A workspace assigned by the platform, signed in as its admin. */
  async function workspace(body: Record<string, unknown> = {}) {
    const slug = uniqueSlug('help');
    const adminEmail = `admin@${slug}.test`;
    const res = await api(app)
      .post('/platform/tenants')
      .set(bearer(platform))
      .send({
        name: `Help ${slug}`,
        slug,
        industryTemplate: 'corporate',
        billingMode: 'trial',
        planCode: 'business',
        accessExpiresAt: new Date(Date.now() + 20 * DAY).toISOString(),
        reason: 'Support end-to-end test workspace',
        admin: { name: 'Nasrin Sultana', email: adminEmail, password: testEnv().password },
        ...body,
      })
      .expect(201);
    return {
      id: res.body.tenant.id as string,
      slug,
      adminEmail,
      adminId: res.body.admin.id as string,
      token: await signIn(slug, adminEmail),
    };
  }

  async function signIn(slug: string, loginEmail: string) {
    const res = await api(app)
      .post('/auth/login')
      .send({ tenant: slug, email: loginEmail, password: testEnv().password })
      .expect(200);
    return res.body.accessToken as string;
  }

  /** Another login in the workspace, through the users API. */
  async function login(ws: { slug: string; token: string }, role: string, name = 'Karim Uddin') {
    const loginEmail = `${role}-${stamp}-${seq++}@${ws.slug}.test`;
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(ws.token))
        .send({ name, email: loginEmail, role, password: testEnv().password })
        .expect(201)
    ).body as WorkspaceUserCreated;
    return { id: user.id, email: loginEmail, token: await signIn(ws.slug, loginEmail) };
  }

  async function platformUser(role: PlatformRole, name: string) {
    const address = `${uniqueSlug(role)}@goodpeople.test`;
    const [row] = await db
      .insert(platformUsers)
      .values({ email: address, name, passwordHash: await hashPassword(testEnv().password), role })
      .returning({ id: platformUsers.id });
    return { id: row!.id, token: await platformToken(app, address) };
  }

  const ticketBody = (overrides: Record<string, string> = {}) => ({
    category: 'payroll',
    priority: 'normal',
    subject: subject('Payslips show the wrong month'),
    body: 'The payslips for October say September at the top.',
    ...overrides,
  });

  /** Opens a ticket as multipart, with files as [name, bytes]. */
  function openWith(
    token: string,
    fields: Record<string, string>,
    files: [string, Buffer][] = [],
  ): Test {
    let req = api(app).post('/tenant/support/tickets').set(bearer(token));
    for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
    for (const [name, bytes] of files) req = req.attach('files', bytes, name);
    return req;
  }

  async function open(token: string, overrides: Record<string, string> = {}) {
    return (
      await api(app)
        .post('/tenant/support/tickets')
        .set(bearer(token))
        .send(ticketBody(overrides))
        .expect(201)
    ).body as SupportTicketDetail;
  }

  const detail = async (token: string, id: string) =>
    (await api(app).get(`/tenant/support/tickets/${id}`).set(bearer(token)).expect(200))
      .body as SupportTicketDetail;
  const consoleDetail = async (id: string, token = platform) =>
    (await api(app).get(`/platform/support/tickets/${id}`).set(bearer(token)).expect(200))
      .body as SupportTicketDetail;
  const mine = async (token: string, scope = 'mine') =>
    (await api(app).get(`/tenant/support/tickets?scope=${scope}`).set(bearer(token)).expect(200))
      .body as SupportTicketSummary[];
  const queue = async (query: string, token = platform) =>
    (await api(app).get(`/platform/support/tickets?${query}`).set(bearer(token)).expect(200))
      .body as SupportTicketSummary[];
  const supportReply = (id: string, body: Record<string, unknown>, token = platform) =>
    api(app).post(`/platform/support/tickets/${id}/replies`).set(bearer(token)).send(body);
  const customerReply = (token: string, id: string, body = 'It still shows September.') =>
    api(app).post(`/tenant/support/tickets/${id}/replies`).set(bearer(token)).send({ body });
  const mailTo = (to: string, label: string) =>
    email.sent.filter((m) => m.to === to && m.subject.includes(`[${label}]`));

  beforeAll(async () => {
    app = await bootApp();
    email = app.get(EMAIL_SENDER);
    jobs = app.get(SupportJobs);
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    platform = await platformToken(app);
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('opens a ticket with files, lists it, shows it and tells the support inbox', async () => {
    const ws = await workspace();
    const fields = ticketBody({
      priority: 'urgent',
      requestId: 'req_7f3c9a1e42',
      pagePath: '/workspace/payroll/runs',
    });
    const res = await openWith(ws.token, fields, [
      ['C:\\Users\\nasrin\\screen.png', PNG],
      ['codes.csv', Buffer.from('code,name\nE1,রহিম\n')],
    ]).expect(201);
    const ticket = res.body as SupportTicketDetail;
    expect(ticket).toMatchObject({
      number: expect.any(Number),
      tenant: { id: ws.id, slug: ws.slug, plan: 'business' },
      category: 'payroll',
      priority: 'urgent',
      status: 'open',
      subject: fields.subject,
      openedBy: { name: 'Nasrin Sultana', email: ws.adminEmail },
      assignee: null,
      firstRespondedAt: null,
      overdue: false,
      requestId: 'req_7f3c9a1e42',
      pagePath: '/workspace/payroll/runs',
      access: null,
    });
    expect(ticket.number).toBeGreaterThanOrEqual(1001);
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0]).toMatchObject({
      author: 'customer',
      authorName: 'Nasrin Sultana',
      body: fields.body,
      internal: false,
    });
    const files = ticket.messages[0]!.attachments;
    expect(files.map((f) => [f.fileName, f.contentType, f.sizeBytes])).toEqual(
      expect.arrayContaining([
        ['screen.png', 'image/png', PNG.length],
        ['codes.csv', 'text/csv', expect.any(Number)],
      ]),
    );

    expect((await mine(ws.token)).map((t) => t.id)).toEqual([ticket.id]);
    expect((await detail(ws.token, ticket.id)).messages[0]!.body).toBe(fields.body);

    const png = files.find((f) => f.contentType === 'image/png')!;
    const file = await binary(
      api(app).get(`/tenant/support/attachments/${png.id}`).set(bearer(ws.token)),
    ).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename="screen\.png"/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);

    const [mail] = mailTo(INBOX, `GP-${ticket.number}`);
    expect(mail?.subject).toBe(`[GP-${ticket.number}] URGENT New ticket: ${fields.subject}`);
    expect(mail?.text).toContain(`Help ${ws.slug} opened GP-${ticket.number}.`);
    expect(mail?.text).toContain('Priority: Urgent');
    expect(mail?.text).toContain('First response due: ');
    expect(mail?.text).toContain(`http://localhost:3000/platform/support/${ticket.id}`);
    // The description stays in the console.
    expect(mail?.text).not.toContain(fields.body);
  });

  it('keeps internal notes and their files away from the workspace', async () => {
    const ws = await workspace();
    const ticket = await open(ws.token);
    const before = email.sent.length;
    const note = await api(app)
      .post(`/platform/support/tickets/${ticket.id}/replies`)
      .set(bearer(platform))
      .field('body', 'Their September run was approved twice; check the run lock.')
      .field('internal', 'true')
      .attach('files', PDF, 'run-lock.pdf')
      .expect(201);
    const noteMessage = (note.body as SupportTicketDetail).messages.find((m) => m.internal)!;
    expect(noteMessage.attachments).toHaveLength(1);
    // A note changes nothing for the ticket and writes to nobody.
    expect(note.body).toMatchObject({ status: 'open', firstRespondedAt: null });
    expect(email.sent.length).toBe(before);

    const seen = await detail(ws.token, ticket.id);
    expect(seen.messages.map((m) => m.internal)).toEqual([false]);
    expect(JSON.stringify(seen)).not.toContain('run lock');
    await api(app)
      .get(`/tenant/support/attachments/${noteMessage.attachments[0]!.id}`)
      .set(bearer(ws.token))
      .expect(404);

    const console = await consoleDetail(ticket.id);
    expect(console.messages.map((m) => [m.author, m.internal])).toEqual([
      ['customer', false],
      ['support', true],
    ]);
    const file = await binary(
      api(app)
        .get(`/platform/support/attachments/${noteMessage.attachments[0]!.id}`)
        .set(bearer(platform)),
    ).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);

    // A note may still move the ticket when support asks it to.
    const moved = (
      await supportReply(ticket.id, {
        body: 'Waiting on engineering.',
        internal: true,
        status: 'resolved',
      }).expect(201)
    ).body as SupportTicketDetail;
    expect(moved).toMatchObject({ status: 'resolved', firstRespondedAt: null });
  });

  it('answers in the customer’s language, waits on them, and reopens when they reply', async () => {
    const ws = await workspace();
    await api(app)
      .patch('/account/preferences')
      .set(bearer(ws.token))
      .send({ language: 'bn' })
      .expect(200);
    const ticket = await open(ws.token);
    const label = `GP-${ticket.number}`;

    const first = (
      await supportReply(ticket.id, { body: 'Run it again from Payroll, Runs.' }).expect(201)
    ).body as SupportTicketDetail;
    expect(first.status).toBe('waiting_on_customer');
    expect(first.firstRespondedAt).not.toBeNull();
    expect(first.overdue).toBe(false);
    const [answer] = mailTo(ws.adminEmail, label);
    expect(answer?.subject).toBe(`[${label}] গুড পিপল সহায়তা দলের উত্তর: ${ticket.subject}`);
    expect(answer?.text).toContain('Run it again from Payroll, Runs.');
    expect(answer?.text).toContain(`http://localhost:3000/workspace/support/${ticket.id}`);

    const second = (
      await supportReply(ticket.id, { body: 'Fixed on our side.', status: 'resolved' }).expect(201)
    ).body as SupportTicketDetail;
    expect(second.status).toBe('resolved');
    expect(second.firstRespondedAt).toBe(first.firstRespondedAt);
    expect(mailTo(ws.adminEmail, label)[1]?.text).toContain('৭ দিন পর');

    const reopened = (await customerReply(ws.token, ticket.id).expect(201))
      .body as SupportTicketDetail;
    expect(reopened.status).toBe('open');
    expect(reopened.messages.map((m) => m.author)).toEqual([
      'customer',
      'support',
      'support',
      'customer',
    ]);
    const told = mailTo(INBOX, label).at(-1);
    expect(told?.subject).toBe(`[${label}] Customer replied: ${ticket.subject}`);
    expect(told?.text).toContain(`Nasrin Sultana from Help ${ws.slug} replied on ${label}.`);

    // From waiting on the customer too.
    await supportReply(ticket.id, { body: 'Which employee?' }).expect(201);
    expect((await customerReply(ws.token, ticket.id, 'E-104').expect(201)).body.status).toBe(
      'open',
    );

    const solved = (
      await api(app)
        .post(`/tenant/support/tickets/${ticket.id}/solved`)
        .set(bearer(ws.token))
        .expect(200)
    ).body as SupportTicketDetail;
    expect(solved.status).toBe('resolved');
  });

  it('keeps one workspace’s tickets from another', async () => {
    const ours = await workspace();
    const theirs = await workspace();
    const ticket = await openWith(ours.token, ticketBody(), [['shot.png', PNG]]).expect(201);
    const { id, messages } = ticket.body as SupportTicketDetail;
    await api(app).get(`/tenant/support/tickets/${id}`).set(bearer(theirs.token)).expect(404);
    await customerReply(theirs.token, id).expect(404);
    await api(app)
      .post(`/tenant/support/tickets/${id}/solved`)
      .set(bearer(theirs.token))
      .expect(404);
    await api(app)
      .get(`/tenant/support/attachments/${messages[0]!.attachments[0]!.id}`)
      .set(bearer(theirs.token))
      .expect(404);
    expect(await mine(theirs.token, 'all')).toEqual([]);
  });

  it('shows everything to support.manage and only their own tickets to other staff', async () => {
    const ws = await workspace();
    const officer = await login(ws, 'hr_officer');
    const theirs = await open(officer.token);
    const admins = await open(ws.token);

    expect((await mine(officer.token)).map((t) => t.id)).toEqual([theirs.id]);
    expect(
      (
        await api(app)
          .get('/tenant/support/tickets?scope=all')
          .set(bearer(officer.token))
          .expect(403)
      ).body.code,
    ).toBe('role_not_allowed');
    await api(app)
      .get(`/tenant/support/tickets/${admins.id}`)
      .set(bearer(officer.token))
      .expect(404);
    await customerReply(officer.token, admins.id).expect(404);

    expect((await mine(ws.token)).map((t) => t.id)).toEqual([admins.id]);
    expect((await mine(ws.token, 'all')).map((t) => t.id).toSorted()).toEqual(
      [theirs.id, admins.id].toSorted(),
    );
    expect(theirs.openedBy).toMatchObject({ id: officer.id, email: officer.email });
    // The admin can follow up on a colleague's ticket.
    const replied = (
      await customerReply(ws.token, theirs.id, 'Adding the run number: 12.').expect(201)
    ).body as SupportTicketDetail;
    expect(replied.messages.at(-1)).toMatchObject({ authorName: 'Nasrin Sultana' });

    // Employees ask their own HR.
    const employee = await login(ws, 'employee', 'Rahim Mia');
    expect(
      (await api(app).get('/tenant/support/tickets').set(bearer(employee.token)).expect(403)).body
        .code,
    ).toBe('role_not_allowed');
  });

  it('lets a read-only workspace still open, answer and solve tickets', async () => {
    const ws = await workspace({ accessExpiresAt: new Date(Date.now() - DAY).toISOString() });
    const access = (await api(app).get('/tenant/access').set(bearer(ws.token)).expect(200))
      .body as TenantAccessView;
    expect(access.access.accessState).toBe('read_only');
    // Other writes are refused...
    expect(
      (
        await api(app)
          .post('/tenant/users')
          .set(bearer(ws.token))
          .send({ name: 'New Person', email: `x-${stamp}@example.test`, role: 'auditor' })
          .expect(403)
      ).body.code,
    ).toBe('tenant_read_only');
    // ...but not contacting us.
    const ticket = await openWith(ws.token, ticketBody({ category: 'billing' }), [
      ['receipt.pdf', PDF],
    ]).expect(201);
    const id = (ticket.body as SupportTicketDetail).id;
    await customerReply(ws.token, id).expect(201);
    await api(app).post(`/tenant/support/tickets/${id}/solved`).set(bearer(ws.token)).expect(200);
  });

  it('sets the first-response target from the plan and the priority', async () => {
    const starter = await workspace({ planCode: 'starter' });
    const enterprise = await workspace({
      billingMode: 'complimentary',
      planCode: 'enterprise',
      accessExpiresAt: null,
    });

    const slow = await open(starter.token);
    expect(slow.firstResponseDueAt).toBe(target(slow, 'starter', 'normal'));
    const fast = await open(enterprise.token, { priority: 'urgent' });
    expect(fast.firstResponseDueAt).toBe(target(fast, 'enterprise', 'urgent'));

    // Re-prioritised before anyone answered: the target is worked out again from the opening.
    const urgent = (
      await api(app)
        .patch(`/platform/support/tickets/${slow.id}`)
        .set(bearer(platform))
        .send({ priority: 'urgent' })
        .expect(200)
    ).body as SupportTicketDetail;
    expect(urgent.firstResponseDueAt).toBe(target(slow, 'starter', 'urgent'));
    // After the first answer it stays.
    await supportReply(slow.id, { body: 'Looking into it.' }).expect(201);
    const after = (
      await api(app)
        .patch(`/platform/support/tickets/${slow.id}`)
        .set(bearer(platform))
        .send({ priority: 'normal', category: 'bug' })
        .expect(200)
    ).body as SupportTicketDetail;
    expect(after).toMatchObject({ priority: 'normal', category: 'bug' });
    expect(after.firstResponseDueAt).toBe(urgent.firstResponseDueAt);

    const audit = await api(app)
      .get(`/platform/audit?tenantId=${starter.id}`)
      .set(bearer(platform))
      .expect(200);
    const actions = (audit.body as { action: string }[]).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['support.ticket.update', 'support.ticket.reply']),
    );
  });

  it('queues urgent and overdue tickets first and filters the queue', async () => {
    const ws = await workspace();
    const normal = await open(ws.token);
    const urgent = await open(ws.token, { priority: 'urgent' });
    const late = await open(ws.token);
    await db
      .update(supportTickets)
      .set({ firstResponseDueAt: new Date(Date.now() - 60_000) })
      .where(eq(supportTickets.id, late.id));

    const ordered = await queue(`tenantId=${ws.id}`);
    expect(ordered.map((t) => t.id)).toEqual([late.id, urgent.id, normal.id]);
    expect(ordered[0]).toMatchObject({ overdue: true, tenant: { name: `Help ${ws.slug}` } });

    expect((await queue(`tenantId=${ws.id}&q=GP-${urgent.number}`)).map((t) => t.id)).toEqual([
      urgent.id,
    ]);
    expect((await queue(`q=${encodeURIComponent(late.subject)}`)).map((t) => t.id)).toEqual([
      late.id,
    ]);
    expect(await queue(`tenantId=${ws.id}&status=resolved`)).toEqual([]);

    const support = await platformUser('support', 'Tania Akter');
    const assigned = (
      await api(app)
        .patch(`/platform/support/tickets/${normal.id}`)
        .set(bearer(support.token))
        .send({ assigneeId: support.id })
        .expect(200)
    ).body as SupportTicketDetail;
    expect(assigned.assignee).toEqual({ id: support.id, name: 'Tania Akter' });
    expect((await queue(`tenantId=${ws.id}&assignee=me`, support.token)).map((t) => t.id)).toEqual([
      normal.id,
    ]);
    expect((await queue(`tenantId=${ws.id}&assignee=none`)).map((t) => t.id).toSorted()).toEqual(
      [late.id, urgent.id].toSorted(),
    );
    // The workspace never sees who holds it.
    expect((await detail(ws.token, normal.id)).assignee).toBeNull();

    // Support's own replies carry their name.
    const answered = (await supportReply(normal.id, { body: 'On it.' }, support.token).expect(201))
      .body as SupportTicketDetail;
    expect(answered.messages.at(-1)).toMatchObject({
      author: 'support',
      authorName: 'Tania Akter',
    });

    const unassigned = (
      await api(app)
        .patch(`/platform/support/tickets/${normal.id}`)
        .set(bearer(platform))
        .send({ assigneeId: null })
        .expect(200)
    ).body as SupportTicketDetail;
    expect(unassigned.assignee).toBeNull();
  });

  it('closes resolved tickets after a week, and a closed ticket takes no replies', async () => {
    const ws = await workspace();
    const old = await open(ws.token);
    const recent = await open(ws.token);
    await supportReply(old.id, { body: 'Done.', status: 'resolved' }).expect(201);
    await supportReply(recent.id, { body: 'Done too.', status: 'resolved' }).expect(201);
    // As if it was opened nine days ago and resolved the day after.
    await db
      .update(supportTickets)
      .set({
        createdAt: new Date(Date.now() - 9 * DAY),
        lastCustomerMessageAt: new Date(Date.now() - 9 * DAY),
        resolvedAt: new Date(Date.now() - 8 * DAY),
      })
      .where(eq(supportTickets.id, old.id));

    const closed = await jobs.closeResolved();
    expect(closed).toContain(old.id);
    expect(closed).not.toContain(recent.id);
    expect(await jobs.closeResolved()).not.toContain(old.id);

    const now = await detail(ws.token, old.id);
    expect(now.status).toBe('closed');
    expect((await detail(ws.token, recent.id)).status).toBe('resolved');

    const refused = [
      customerReply(ws.token, old.id),
      api(app).post(`/tenant/support/tickets/${old.id}/solved`).set(bearer(ws.token)),
      supportReply(old.id, { body: 'One more thing.' }),
      supportReply(old.id, { body: 'A note.', internal: true }),
      api(app)
        .patch(`/platform/support/tickets/${old.id}`)
        .set(bearer(platform))
        .send({ status: 'open' }),
    ];
    for (const res of await Promise.all(refused.map((r) => r.expect(409)))) {
      expect(res.body.code).toBe('ticket_closed');
    }
  });

  it('refuses programs dressed as pictures, too many files and files too large', async () => {
    const ws = await workspace();
    const fields = ticketBody();
    const exe = await openWith(ws.token, fields, [['screenshot.png', EXE]]).expect(415);
    expect(exe.body.code).toBe('attachment_type');
    expect(await mine(ws.token)).toEqual([]);

    const six = Array.from({ length: 6 }, (_, i): [string, Buffer] => [`shot-${i}.png`, PNG]);
    expect((await openWith(ws.token, fields, six).expect(400)).body.code).toBe(
      'too_many_attachments',
    );
    const big = Buffer.concat([PDF, Buffer.alloc(SUPPORT_ATTACHMENT_MAX_BYTES)]);
    expect((await openWith(ws.token, fields, [['big.pdf', big]]).expect(413)).body.code).toBe(
      'attachment_too_large',
    );

    const ticket = await open(ws.token);
    const reply = await api(app)
      .post(`/tenant/support/tickets/${ticket.id}/replies`)
      .set(bearer(ws.token))
      .field('body', 'Here is the file.')
      .attach('files', EXE, 'payslip.pdf')
      .expect(415);
    expect(reply.body.code).toBe('attachment_type');
    expect((await detail(ws.token, ticket.id)).messages).toHaveLength(1);
  });

  it('limits how many tickets a login opens in an hour', async () => {
    const ws = await workspace();
    for (let i = 0; i < 10; i++) await open(ws.token);
    const res = await api(app)
      .post('/tenant/support/tickets')
      .set(bearer(ws.token))
      .send(ticketBody())
      .expect(429);
    expect(res.body.code).toBe('too_many_attempts');
  });

  it('shows support the access the workspace has granted for the ticket', async () => {
    const ws = await workspace();
    const ticket = await open(ws.token);
    const other = await open(ws.token);
    const grant = {
      tenantId: ws.id,
      grantedByUserId: ws.adminId,
      grantedByName: 'Nasrin Sultana',
      endsAt: new Date(Date.now() + 2 * DAY),
    };
    // Expired and revoked grants do not count.
    await db.insert(supportAccessGrants).values([
      { ...grant, ticketId: ticket.id, endsAt: new Date(Date.now() - 60_000) },
      { ...grant, ticketId: ticket.id, revokedAt: new Date() },
    ]);
    expect((await consoleDetail(ticket.id)).access).toBeNull();

    const [tied] = await db
      .insert(supportAccessGrants)
      .values({ ...grant, ticketId: ticket.id, note: 'Look at the October run' })
      .returning();
    const shown = (await consoleDetail(ticket.id)).access;
    expect(shown).toMatchObject({
      id: tied!.id,
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      grantedBy: { id: ws.adminId, name: 'Nasrin Sultana' },
      note: 'Look at the October run',
      endsAt: grant.endsAt.toISOString(),
      active: true,
      sessions: [],
    });
    // A grant tied to another ticket is not this ticket's; one for the whole workspace is.
    expect((await consoleDetail(other.id)).access).toBeNull();
    const [whole] = await db
      .insert(supportAccessGrants)
      .values({ ...grant, ticketId: null })
      .returning();
    expect((await consoleDetail(other.id)).access?.id).toBe(whole!.id);
    expect((await consoleDetail(ticket.id)).access?.id).toBe(tied!.id);
  });

  it('keeps the support role, other platform roles and workspace logins out', async () => {
    const ws = await workspace();
    const ticket = await open(ws.token);

    const agent = await platformUser('support', 'Sadia Islam');
    const [grant] = await db
      .insert(supportAccessGrants)
      .values({
        tenantId: ws.id,
        grantedByUserId: ws.adminId,
        grantedByName: 'Nasrin Sultana',
        endsAt: new Date(Date.now() + DAY),
      })
      .returning({ id: supportAccessGrants.id });
    const opened = (
      await api(app)
        .post('/platform/support/access/sessions')
        .set(bearer(agent.token))
        .send({ tenantId: ws.id, grantId: grant!.id })
        .expect(201)
    ).body;
    const asSupport = bearer(opened.accessToken);
    // It can look around the workspace, but has nobody to open a ticket with.
    await api(app).get('/tenant/access').set(asSupport).expect(200);
    for (const path of ['/tenant/support/tickets', `/tenant/support/tickets/${ticket.id}`]) {
      expect((await api(app).get(path).set(asSupport).expect(403)).body.code).toBe(
        'role_not_allowed',
      );
    }
    await api(app).post('/tenant/support/tickets').set(asSupport).send(ticketBody()).expect(403);
    await api(app)
      .post(`/tenant/support/tickets/${ticket.id}/replies`)
      .set(asSupport)
      .send({ body: 'Hello there' })
      .expect(403);
    expect((await detail(ws.token, ticket.id)).messages).toHaveLength(1);

    const finance = await platformUser('finance', 'Farid Ahmed');
    expect(
      (await api(app).get('/platform/support/tickets').set(bearer(finance.token)).expect(403)).body
        .code,
    ).toBe('platform_role');
    await supportReply(ticket.id, { body: 'Not mine to answer.' }, finance.token).expect(403);
    // Nor can a ticket be handed to them.
    expect(
      (
        await api(app)
          .patch(`/platform/support/tickets/${ticket.id}`)
          .set(bearer(platform))
          .send({ assigneeId: finance.id })
          .expect(400)
      ).body.code,
    ).toBe('assignee_not_support');

    const ops = await platformUser('platform_ops', 'Omar Faruk');
    await api(app).get(`/platform/support/tickets/${ticket.id}`).set(bearer(ops.token)).expect(200);

    expect(
      (await api(app).get('/platform/support/tickets').set(bearer(ws.token)).expect(403)).body.code,
    ).toBe('platform_only');
    expect(
      (await api(app).get('/tenant/support/tickets').set(bearer(platform)).expect(403)).body.code,
    ).toBe('tenant_only');
  });
});
