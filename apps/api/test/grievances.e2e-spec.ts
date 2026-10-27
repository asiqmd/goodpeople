import {
  committeeMembers,
  committees,
  createDb,
  createFieldCipher,
  CIPHER_FIELDS,
  employees,
  grievances,
  notificationDeliveries,
  notifications,
  runAsTenant,
  tenantAuditLog,
  tenants,
  type Database,
} from '@gp/db';
import {
  addDays,
  todayIn,
  type GrievanceDetail,
  type GrievanceFollowUp,
  type GrievanceList,
  type SpeakUpInfo,
  type TenantRole,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import {
  api,
  bearer,
  bootApp,
  platformToken,
  tenantLogin,
  testEnv,
  uniqueSlug,
} from './test-env.js';

const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };

// Each test raises its own grievances, and the committee tests make their own workspaces,
// so the tests pass in any order.
describe('grievances', () => {
  let app: INestApplication;
  let db: Database;
  let pool: ReturnType<typeof createDb>['pool'];
  let platform: string;
  let groupAdmin: string;
  let groupId: string;
  const cipher = createFieldCipher(testEnv().fieldKey);
  const today = todayIn();
  let seq = 0;

  const info = (slug: string) => api(app).get(`/speak-up/${slug}`);
  const raise = (slug: string, body: Record<string, unknown>) =>
    api(app)
      .post(`/speak-up/${slug}/grievances`)
      .send({
        category: 'wages',
        text: 'My overtime for September was not paid.',
        pin: '2468',
        ...body,
      });
  const followUp = (slug: string, reference: string, pin = '2468') =>
    api(app).post(`/speak-up/${slug}/follow-up`).send({ reference, pin });
  const list = async (token: string, query = '') =>
    (await api(app).get(`/tenant/grievances${query}`).set(bearer(token)).expect(200))
      .body as GrievanceList;
  const stored = async (tenantId: string, reference: string) => {
    const [row] = await runAsTenant(db, tenantId, (tx) =>
      tx.select().from(grievances).where(eq(grievances.reference, reference)),
    );
    return row!;
  };
  const toldAbout = (tenantId: string, grievanceId: string) =>
    runAsTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(notifications)
        .where(like(notifications.dedupeKey, `grievance.received:${grievanceId}:%`)),
    );

  /** A workspace the platform assigns, with a company, signed in as its admin. */
  async function workspace() {
    const slug = uniqueSlug('voice');
    const res = await api(app)
      .post('/platform/tenants')
      .set(bearer(platform))
      .send({
        name: `Voice ${slug}`,
        slug,
        industryTemplate: 'rmg',
        billingMode: 'complimentary',
        planCode: 'enterprise',
        reason: 'Grievances end-to-end test workspace',
        admin: { name: 'Voice Admin', email: `admin@${slug}.test`, password: testEnv().password },
      })
      .expect(201);
    const token = (await tenantLogin(app, slug)).accessToken;
    const entity = (
      await api(app)
        .post('/tenant/legal-entities')
        .set(bearer(token))
        .send({ name: `Voice ${slug} Ltd` })
        .expect(201)
    ).body as { id: string };
    return { id: res.body.tenant.id as string, slug, token, entityId: entity.id };
  }

  /** An employee with a login of the given role, and that login's token. */
  async function staff(ws: { slug: string; token: string; entityId: string }, role: TenantRole) {
    seq += 1;
    const code = `V-${Date.now().toString(36)}-${seq}`.toUpperCase();
    const email = `${code.toLowerCase()}@example.test`;
    const employee = (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(ws.token))
        .send({
          employeeCode: code,
          fullName: `Committee Test ${seq}`,
          fatherName: 'Abdul Hai',
          motherName: 'Rabeya Begum',
          dateOfBirth: '1988-03-14',
          gender: 'female',
          religion: 'islam',
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: { nid: `${Date.now()}${seq}`.slice(-10) },
          joinedOn: '2024-01-01',
          job: { legalEntityId: ws.entityId, employmentType: 'permanent', workerCategory: 'staff' },
          portalAccess: { email, role, password: testEnv().password },
        })
        .expect(201)
    ).body.employee as { id: string };
    const login = await api(app)
      .post('/auth/login')
      .send({ tenant: ws.slug, email, password: testEnv().password })
      .expect(200);
    return { employeeId: employee.id, token: login.body.accessToken as string };
  }

  async function complaintCommittee(
    tenantId: string,
    members: { employeeId: string; toOn?: string }[],
  ) {
    await runAsTenant(db, tenantId, async (tx) => {
      const [committee] = await tx
        .insert(committees)
        .values({
          tenantId,
          kind: 'complaint',
          name: 'Complaint committee',
          formedOn: addDays(today, -60),
        })
        .returning();
      await tx.insert(committeeMembers).values(
        members.map((m) => ({
          tenantId,
          committeeId: committee!.id,
          employeeId: m.employeeId,
          name: 'Member',
          side: 'worker' as const,
          selection: 'nominated' as const,
          fromOn: addDays(today, -60),
          toOn: m.toOn ?? null,
        })),
      );
    });
  }

  beforeAll(async () => {
    app = await bootApp();
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    platform = await platformToken(app);
    groupAdmin = (await tenantLogin(app, 'my-group')).accessToken;
    const [group] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    groupId = group!.id;
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('takes an anonymous grievance that keeps no trace of who raised it', async () => {
    const page = (await info('my-group').expect(200)).body as SpeakUpInfo;
    expect(page.workspace.slug).toBe('my-group');
    expect(page.categories).toContain('harassment');
    expect(page.deadline).toMatchObject({ days: 30, reference: { section: '33' } });
    const site = page.sites[0]!;

    const text = `The drinking water on line 3 has been dirty for a week (${Date.now()}).`;
    const raised = await raise('MY-GROUP', {
      category: 'facilities',
      text,
      locationId: site.id,
    }).expect(201);
    const reference = raised.body.reference as string;
    expect(reference).toMatch(/^GR-[2-9A-HJKMNP-TW-Z]{6}$/);
    expect(Object.keys(raised.body).toSorted()).toEqual(['createdAt', 'reference']);

    const row = await stored(groupId, reference);
    expect(row).toMatchObject({
      anonymous: true,
      reporterEmployeeId: null,
      channel: 'web',
      status: 'new',
      restricted: false,
      locationId: site.id,
    });
    expect(row.bodyEnc).not.toContain('water');
    expect(row.pinHash).not.toContain('2468');
    // Nowhere to keep who sent it: no address, device, session or login.
    const columns = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = 'grievances'`,
    );
    const names = columns.rows.map((c) => c.column_name);
    expect(names).toContain('reporter_employee_id');
    expect(names.filter((n) => /(^|_)ip(_|$)|address|agent|session|user|device/.test(n))).toEqual(
      [],
    );

    // Followed up however the reference is typed, and with a PIN in Bangla digits.
    const seen = (
      await followUp('my-group', reference.toLowerCase().replace('-', ' '), '২৪৬৮').expect(200)
    ).body as GrievanceFollowUp;
    expect(seen).toMatchObject({ reference, category: 'facilities', status: 'new' });
    expect(seen.thread).toEqual([{ author: 'reporter', text, createdAt: seen.createdAt }]);

    const mine = (await list(groupAdmin, '?category=facilities')).items.find(
      (g) => g.reference === reference,
    );
    expect(mine).toMatchObject({
      anonymous: true,
      ageDays: 0,
      overdue: false,
      awaitingReply: true,
      dueOn: addDays(today, 30),
      location: { id: site.id, name: site.name },
    });
    expect((await list(groupAdmin, '?status=closed')).items.map((g) => g.reference)).not.toContain(
      reference,
    );
  });

  it('locks a reference for 15 minutes after five wrong PINs', async () => {
    const locked = (await raise('my-group', { pin: '135790' }).expect(201)).body.reference;
    const open = (await raise('my-group', { pin: '135790' }).expect(201)).body.reference;
    for (let i = 0; i < 5; i++) {
      const wrong = await followUp('my-group', locked, `99${i}9`).expect(401);
      expect(wrong.body.code).toBe('wrong_reference_or_pin');
    }
    const refused = await followUp('my-group', locked, '135790').expect(429);
    expect(refused.body.code).toBe('grievance_locked');
    expect(refused.body.retryAfterSeconds).toBeGreaterThan(14 * 60);
    await api(app)
      .post('/speak-up/my-group/replies')
      .send({ reference: locked, pin: '135790', text: 'Is anyone reading this?' })
      .expect(429);

    // Only that reference: another still opens, and an unknown one is just wrong.
    await followUp('my-group', open, '135790').expect(200);
    expect((await followUp('my-group', 'GR-ZZZZZZ').expect(401)).body.code).toBe(
      'wrong_reference_or_pin',
    );
    await followUp('my-group', 'not a reference').expect(400);
  });

  it('carries answers from staff to the reporter and back', async () => {
    const reference = (await raise('my-group', { category: 'hours' }).expect(201)).body.reference;
    const { id } = (await list(groupAdmin)).items.find((g) => g.reference === reference)!;

    const answer = 'We checked the register: it will be paid with October wages.';
    const answered = (
      await api(app)
        .post(`/tenant/grievances/${id}/replies`)
        .set(bearer(groupAdmin))
        .send({ text: answer })
        .expect(201)
    ).body as GrievanceDetail;
    expect(answered.status).toBe('responded');
    expect(answered.awaitingReply).toBe(false);
    expect(answered.thread[1]).toMatchObject({ author: 'staff', text: answer });
    expect(answered.thread[1]!.staff?.name).toBeTruthy();

    // The reporter sees the answer, but not who wrote it.
    const seen = (await followUp('my-group', reference).expect(200)).body as GrievanceFollowUp;
    expect(seen.status).toBe('responded');
    expect(seen.thread.map((m) => m.author)).toEqual(['reporter', 'staff']);
    expect(seen.thread[1]).toEqual({
      author: 'staff',
      text: answer,
      createdAt: expect.any(String),
    });

    const back = 'Thank you. Please also check August.';
    const replied = (
      await api(app)
        .post('/speak-up/my-group/replies')
        .send({ reference, pin: '2468', text: back })
        .expect(201)
    ).body as GrievanceFollowUp;
    expect(replied.status).toBe('in_review');
    const detail = (
      await api(app).get(`/tenant/grievances/${id}`).set(bearer(groupAdmin)).expect(200)
    ).body as GrievanceDetail;
    expect(detail.thread.map((m) => [m.author, m.text])).toEqual([
      ['reporter', 'My overtime for September was not paid.'],
      ['staff', answer],
      ['reporter', back],
    ]);
    expect(detail).toMatchObject({ awaitingReply: true, reporter: null });

    // Staff answers are audited without their words.
    const [audit] = await runAsTenant(db, groupId, (tx) =>
      tx
        .select()
        .from(tenantAuditLog)
        .where(and(eq(tenantAuditLog.action, 'grievance.reply'), eq(tenantAuditLog.entityId, id))),
    );
    expect(audit?.after).toMatchObject({ status: 'responded' });
    expect(JSON.stringify(audit)).not.toContain('October');

    // Resolving stops the clock; once closed, nobody writes to it until it is reopened.
    const closedView = (
      await api(app)
        .patch(`/tenant/grievances/${id}`)
        .set(bearer(groupAdmin))
        .send({ status: 'closed' })
        .expect(200)
    ).body as GrievanceDetail;
    expect(closedView.closedAt).not.toBeNull();
    const closed = await api(app)
      .post('/speak-up/my-group/replies')
      .send({ reference, pin: '2468', text: 'One more thing about this.' })
      .expect(400);
    expect(closed.body.code).toBe('grievance_closed');
    await api(app)
      .post(`/tenant/grievances/${id}/replies`)
      .set(bearer(groupAdmin))
      .send({ text: 'A note after closing it.' })
      .expect(400);
    const reopened = (
      await api(app)
        .patch(`/tenant/grievances/${id}`)
        .set(bearer(groupAdmin))
        .send({ status: 'in_review' })
        .expect(200)
    ).body as GrievanceDetail;
    expect(reopened.closedAt).toBeNull();
  });

  it('keeps harassment with the complaint committee', async () => {
    const ws = await workspace();
    const member = await staff(ws, 'hr_admin');
    const other = await staff(ws, 'hr_admin');
    // `other` sat on the committee until yesterday.
    await complaintCommittee(ws.id, [
      { employeeId: member.employeeId },
      { employeeId: other.employeeId, toOn: addDays(today, -1) },
    ]);

    const harassment = (
      await raise(ws.slug, {
        category: 'harassment',
        text: 'A supervisor on my line keeps touching me and threatening me.',
      }).expect(201)
    ).body.reference;
    const wages = (await raise(ws.slug, {}).expect(201)).body.reference;
    const harassmentRow = await stored(ws.id, harassment);
    expect(harassmentRow.restricted).toBe(true);

    const committeeView = await list(member.token);
    expect(committeeView.committeeMissing).toBe(false);
    expect(committeeView.items.map((g) => g.reference).toSorted()).toEqual(
      [harassment, wages].toSorted(),
    );
    const opened = (
      await api(app)
        .get(`/tenant/grievances/${harassmentRow.id}`)
        .set(bearer(member.token))
        .expect(200)
    ).body as GrievanceDetail;
    expect(opened.thread[0]!.text).toContain('supervisor');

    for (const outsider of [other.token, ws.token]) {
      expect((await list(outsider)).items.map((g) => g.reference)).toEqual([wages]);
      await api(app)
        .get(`/tenant/grievances/${harassmentRow.id}`)
        .set(bearer(outsider))
        .expect(404);
      await api(app)
        .post(`/tenant/grievances/${harassmentRow.id}/replies`)
        .set(bearer(outsider))
        .send({ text: 'Trying to answer it anyway.' })
        .expect(404);
    }

    // Only the committee is told about harassment; everyone who handles grievances about wages.
    const memberUser = await runAsTenant(db, ws.id, (tx) =>
      tx
        .select({ userId: employees.userId })
        .from(employees)
        .where(inArray(employees.id, [member.employeeId])),
    );
    const told = await toldAbout(ws.id, harassmentRow.id);
    expect(told.map((n) => n.userId)).toEqual([memberUser[0]!.userId]);
    expect((await toldAbout(ws.id, (await stored(ws.id, wages)).id)).length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('lets a worker on the complaint committee hear harassment cases, and nothing else', async () => {
    const ws = await workspace();
    const worker = await staff(ws, 'employee');
    const stranger = await staff(ws, 'employee');
    await complaintCommittee(ws.id, [{ employeeId: worker.employeeId }]);
    const harassment = (
      await raise(ws.slug, {
        category: 'harassment',
        text: 'Someone in the finishing section keeps following me home.',
      }).expect(201)
    ).body.reference;
    const wages = await stored(ws.id, (await raise(ws.slug, {}).expect(201)).body.reference);
    const harassmentRow = await stored(ws.id, harassment);

    await api(app).get('/tenant/grievances/access').set(bearer(worker.token)).expect(200);
    expect((await list(worker.token)).items.map((g) => g.reference)).toEqual([harassment]);
    await api(app)
      .get(`/tenant/grievances/${harassmentRow.id}`)
      .set(bearer(worker.token))
      .expect(200);
    await api(app)
      .post(`/tenant/grievances/${harassmentRow.id}/replies`)
      .set(bearer(worker.token))
      .send({ text: 'The committee will meet you tomorrow.' })
      .expect(201);
    // Grievances other than harassment stay with those who handle them.
    await api(app).get(`/tenant/grievances/${wages.id}`).set(bearer(worker.token)).expect(404);
    // A worker not on the committee has no way in.
    await api(app).get('/tenant/grievances/access').set(bearer(stranger.token)).expect(403);
    await api(app).get('/tenant/grievances').set(bearer(stranger.token)).expect(403);

    const workerUser = await runAsTenant(db, ws.id, (tx) =>
      tx
        .select({ userId: employees.userId })
        .from(employees)
        .where(inArray(employees.id, [worker.employeeId])),
    );
    const told = await toldAbout(ws.id, harassmentRow.id);
    expect(told.map((n) => n.userId)).toEqual([workerUser[0]!.userId]);
  });

  it('shows harassment only to the workspace admin when there is no committee', async () => {
    const ws = await workspace();
    // HR handles grievances but could empty the committee (s.332A), so it does not read them.
    const hr = await staff(ws, 'hr_admin');
    const reference = (
      await raise(ws.slug, { category: 'harassment', text: 'I was shouted at and pushed.' }).expect(
        201,
      )
    ).body.reference;
    const row = await stored(ws.id, reference);

    const view = await list(ws.token);
    expect(view.committeeMissing).toBe(true);
    expect(view.items).toEqual([expect.objectContaining({ reference, restricted: true })]);
    const detail = (
      await api(app).get(`/tenant/grievances/${row.id}`).set(bearer(ws.token)).expect(200)
    ).body as GrievanceDetail;
    expect(detail).toMatchObject({ restricted: true, committeeMissing: true });

    const hrView = await list(hr.token);
    expect(hrView.committeeMissing).toBe(true);
    expect(hrView.items.map((g) => g.reference)).not.toContain(reference);
    await api(app).get(`/tenant/grievances/${row.id}`).set(bearer(hr.token)).expect(404);
    // Only the admin is told.
    expect((await toldAbout(ws.id, row.id)).length).toBe(1);
  });

  it('tells those who handle grievances the reference and category, never the text', async () => {
    const text = `Secret detail ${Date.now()}: the canteen food made twelve of us ill.`;
    const reference = (await raise('my-group', { category: 'safety', text }).expect(201)).body
      .reference;
    const row = await stored(groupId, reference);
    const told = await toldAbout(groupId, row.id);
    expect(told.length).toBeGreaterThan(0);
    for (const n of told) {
      expect(n.event).toBe('grievance.received');
      expect(n.link).toBe(`/workspace/grievances/${row.id}`);
      expect(`${n.title} ${n.body}`).toContain(reference);
      expect(`${n.title} ${n.body}`).toMatch(/health and safety|স্বাস্থ্য ও নিরাপত্তা/);
      expect(JSON.stringify(n)).not.toMatch(/Secret|canteen/);
    }
    const deliveries = await runAsTenant(db, groupId, (tx) =>
      tx
        .select()
        .from(notificationDeliveries)
        .where(
          inArray(
            notificationDeliveries.notificationId,
            told.map((n) => n.id),
          ),
        ),
    );
    for (const d of deliveries) expect(JSON.stringify(d)).not.toMatch(/Secret|canteen/);
  });

  it('is not found for unknown, suspended and archived workspaces, and stays open when read-only', async () => {
    const unknown = await info('no-such-workspace-here').expect(404);
    expect(unknown.body.code).toBe('workspace_not_found');
    await raise('no-such-workspace-here', {}).expect(404);
    await followUp('no-such-workspace-here', 'GR-7K3P9Q').expect(404);

    const ws = await workspace();
    const setStatus = (status: 'read_only' | 'suspended' | 'archived') =>
      db.update(tenants).set({ status }).where(eq(tenants.id, ws.id));
    await setStatus('read_only');
    const reference = (await raise(ws.slug, {}).expect(201)).body.reference;
    await followUp(ws.slug, reference).expect(200);
    // Answering is the employer's duty whatever its billing.
    const { id } = (await list(ws.token)).items[0]!;
    await api(app)
      .post(`/tenant/grievances/${id}/replies`)
      .set(bearer(ws.token))
      .send({ text: 'We are looking into it now.' })
      .expect(201);
    for (const status of ['suspended', 'archived'] as const) {
      await setStatus(status);
      await info(ws.slug).expect(404);
      await raise(ws.slug, {}).expect(404);
      await followUp(ws.slug, reference).expect(404);
    }
  });

  it('links a named grievance to the employee whose code it gives', async () => {
    const [mg2] = await runAsTenant(db, groupId, (tx) =>
      tx.select().from(employees).where(eq(employees.employeeCode, 'MG-0002')),
    );
    const named = (
      await raise('my-group', {
        category: 'leave',
        text: 'My casual leave was refused without a reason.',
        name: 'Rahima Akter',
        employeeCode: 'mg-০০০২',
        channel: 'kiosk',
      }).expect(201)
    ).body.reference;
    const row = await stored(groupId, named);
    expect(row).toMatchObject({ anonymous: false, reporterEmployeeId: mg2!.id, channel: 'kiosk' });
    expect(row.bodyEnc).not.toContain('Rahima');
    expect(
      JSON.parse(
        cipher.decrypt(row.bodyEnc, { tenantId: groupId, field: CIPHER_FIELDS.grievanceText }),
      ),
    ).toMatchObject({ name: 'Rahima Akter', employeeCode: 'mg-0002' });
    const detail = (
      await api(app).get(`/tenant/grievances/${row.id}`).set(bearer(groupAdmin)).expect(200)
    ).body as GrievanceDetail;
    expect(detail.reporter).toEqual({
      name: 'Rahima Akter',
      employeeCode: 'mg-0002',
      employee: { id: mg2!.id, name: mg2!.fullName, employeeCode: 'MG-0002' },
    });

    // A code that matches nobody keeps the name, linked to no one.
    const unmatched = (
      await raise('my-group', { name: 'Someone Else', employeeCode: 'MG-9999' }).expect(201)
    ).body.reference;
    expect(await stored(groupId, unmatched)).toMatchObject({
      anonymous: false,
      reporterEmployeeId: null,
    });
  });
});
