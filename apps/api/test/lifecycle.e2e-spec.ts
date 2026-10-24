import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ApprovalItem,
  DocumentView,
  EmployeeDetail,
  JobAssignmentView,
  LetterTemplateView,
  LifecycleOverview,
  OrgSnapshot,
  SeparationApprovalItem,
  SeparationView,
} from '@gp/shared';
import { addDays, todayIn } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Test } from 'supertest';
import { api, bearer, bootApp, testEnv, testStorageDir } from './test-env.js';
import { groupHr, rahima, shirin } from './leave-helpers.js';

const PDF = Buffer.from('%PDF-1.4\n% a test document\n%%EOF\n');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const isPdf = (body: Buffer) => body.subarray(0, 4).toString() === '%PDF';

/** Collects a binary response (a PDF, a spreadsheet) as a Buffer. */
const binary = (req: Test) =>
  req.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });

const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;

/** Every file under a directory, to look at what the store holds. */
async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

describe('lifecycle and documents', () => {
  let app: INestApplication;
  let hr: string;
  let worker: string; // Rahima
  let manager: string; // Shirin
  let org: OrgSnapshot;
  const ids = new Map<string, string>();
  let seq = 0;

  beforeAll(async () => {
    app = await bootApp();
    [hr, worker, manager] = await Promise.all([groupHr(app), rahima(app), shirin(app)]);
    org = (await api(app).get('/tenant/org').set(bearer(hr)).expect(200)).body;
    const people = (
      await api(app).get('/tenant/employees?search=MG-00&pageSize=100').set(bearer(hr)).expect(200)
    ).body.items as { id: string; employeeCode: string }[];
    for (const p of people) ids.set(p.employeeCode, p.id);
  });
  afterAll(() => app.close());

  /** Hires someone new for a test that changes their employment. */
  async function hire(overrides: Record<string, unknown> = {}, job: Record<string, unknown> = {}) {
    seq += 1;
    const code = `L-${Date.now().toString(36)}-${seq}`;
    const res = await api(app)
      .post('/tenant/employees')
      .set(bearer(hr))
      .send({
        employeeCode: code,
        fullName: 'Nasrin Sultana',
        fullNameBn: 'নাসরিন সুলতানা',
        fatherName: 'Abdul Karim',
        motherName: 'Hosne Ara',
        dateOfBirth: '1998-02-14',
        gender: 'female',
        mobilePhone: '01812345678',
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
          ...job,
        },
        ...overrides,
      })
      .expect(201);
    return res.body.employee as EmployeeDetail;
  }

  const upload = (
    employeeId: string,
    file: Buffer,
    name: string,
    fields: Record<string, string>,
  ) => {
    let req = api(app)
      .post(`/tenant/employees/${employeeId}/documents`)
      .set(bearer(hr))
      .attach('file', file, name);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req;
  };
  const fileOf = (token: string, id: string) =>
    binary(api(app).get(`/tenant/documents/${id}/file`).set(bearer(token)));
  const settings = (body: object) =>
    api(app).patch('/tenant/attendance/settings').set(bearer(hr)).send(body).expect(200);
  const inbox = async (token: string) =>
    (await api(app).get('/tenant/approvals').set(bearer(token)).expect(200)).body as ApprovalItem[];
  const separationStep = async (token: string, id: string) =>
    (await inbox(token)).find(
      (i): i is SeparationApprovalItem => i.subjectType === 'separation' && i.separation.id === id,
    )!;

  // ── Documents ──────────────────────────────────────────────────────────────

  it('keeps documents encrypted at rest and returns them intact', async () => {
    const doc = (
      await upload(ids.get('MG-0005')!, PDF, 'nid-front.pdf', {
        category: 'nid',
        title: 'National ID',
        visibleToEmployee: 'true',
      }).expect(201)
    ).body as DocumentView;
    expect(doc).toMatchObject({
      contentType: 'application/pdf',
      sizeBytes: PDF.length,
      source: 'upload',
    });

    const stored = (await filesUnder(testStorageDir)).find((f) => f.endsWith(doc.id))!;
    const onDisk = await readFile(stored);
    expect(onDisk.includes(Buffer.from('%PDF'))).toBe(false);

    const res = await fileOf(hr, doc.id).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(Buffer.compare(res.body as Buffer, PDF)).toBe(0);
  });

  it('accepts only PDFs and images, judged by content rather than name', async () => {
    const res = await upload(ids.get('MG-0005')!, Buffer.from('<html><script>'), 'cv.pdf', {
      category: 'other',
      title: 'Not a PDF',
    }).expect(415);
    expect(res.body.code).toBe('unsupported_file');
  });

  it('shows employees only what HR shared with them', async () => {
    const hidden = (
      await upload(ids.get('MG-0005')!, PDF, 'medical.pdf', {
        category: 'medical_certificate',
        title: 'Medical fitness',
      }).expect(201)
    ).body as DocumentView;
    const mine = (await api(app).get('/tenant/me/documents').set(bearer(worker)).expect(200))
      .body as DocumentView[];
    expect(mine.some((d) => d.id === hidden.id)).toBe(false);
    await fileOf(worker, hidden.id).expect(403);
    await fileOf(manager, hidden.id).expect(403);
    await api(app)
      .get(`/tenant/employees/${ids.get('MG-0005')}/documents`)
      .set(bearer(worker))
      .expect(403);
  });

  it('lists documents about to expire, and deletes the file for good', async () => {
    const passport = (
      await upload(ids.get('MG-0004')!, JPEG, 'passport.jpg', {
        category: 'passport',
        title: 'Passport',
        issuedOn: '2016-11-01',
        expiresOn: addDays(todayIn(), 20),
      }).expect(201)
    ).body as DocumentView;
    const expiring = (
      await api(app).get('/tenant/documents/expiring?days=60').set(bearer(hr)).expect(200)
    ).body as DocumentView[];
    expect(expiring.map((d) => d.id)).toContain(passport.id);
    const overview = (await api(app).get('/tenant/lifecycle').set(bearer(hr)).expect(200))
      .body as LifecycleOverview;
    expect(overview.expiringDocuments.map((d) => d.id)).toContain(passport.id);

    await api(app).delete(`/tenant/documents/${passport.id}`).set(bearer(hr)).expect(204);
    await fileOf(hr, passport.id).expect(404);
    expect((await filesUnder(testStorageDir)).some((f) => f.endsWith(passport.id))).toBe(false);
  });

  // ── Separations ────────────────────────────────────────────────────────────

  it('takes a resignation through the supervisor and HR, with the notice the Act asks for', async () => {
    const lastDay = addDays(todayIn(), 30);
    const resignation = (
      await api(app)
        .post('/tenant/me/resignation')
        .set(bearer(worker))
        .send({ lastWorkingDay: lastDay, reason: 'Moving back to Rangpur' })
        .expect(201)
    ).body as SeparationView;
    expect(resignation).toMatchObject({
      status: 'pending',
      type: 'resignation',
      noticeDaysRequired: 60,
      noticeShortfallDays: 30,
    });
    expect(resignation.steps.map((s) => `${s.kind}:${s.status}`)).toEqual([
      'manager:pending',
      'hr:waiting',
    ]);
    await api(app)
      .post('/tenant/me/resignation')
      .set(bearer(worker))
      .send({ lastWorkingDay: lastDay, reason: 'Again' })
      .expect(409);

    const first = await separationStep(manager, resignation.id);
    await api(app)
      .post(`/tenant/approvals/${first.stepId}/approve`)
      .set(bearer(manager))
      .send({})
      .expect(201);
    const second = await separationStep(hr, resignation.id);
    const approved = (
      await api(app)
        .post(`/tenant/approvals/${second.stepId}/approve`)
        .set(bearer(hr))
        .send({})
        .expect(201)
    ).body as SeparationView;
    // Approved, but she works until her last day.
    expect(approved.status).toBe('approved');
    const detail = (
      await api(app)
        .get(`/tenant/employees/${ids.get('MG-0005')}`)
        .set(bearer(hr))
    ).body;
    expect(detail.status).toBe('active');

    // Only HR can call off an approved separation.
    await api(app)
      .post(`/tenant/separations/${resignation.id}/cancel`)
      .set(bearer(worker))
      .expect(403);
    const cancelled = (
      await api(app)
        .post(`/tenant/separations/${resignation.id}/cancel`)
        .set(bearer(hr))
        .expect(201)
    ).body as SeparationView;
    expect(cancelled.status).toBe('cancelled');
  });

  it('completes a separation after the last day: the job ends and the login stops working', async () => {
    const email = `leaver-${Date.now()}@my-group.test`;
    const password = 'Leaving-2026!';
    const person = await hire({ portalAccess: { email, password, role: 'employee' } });
    const login = (
      await api(app).post('/auth/login').send({ tenant: 'my-group', email, password }).expect(200)
    ).body;

    const yesterday = addDays(todayIn(), -1);
    const separation = (
      await api(app)
        .post(`/tenant/employees/${person.id}/separations`)
        .set(bearer(hr))
        .send({
          type: 'termination',
          noticeDate: addDays(yesterday, -30),
          lastWorkingDay: yesterday,
          reason: 'Position closed',
        })
        .expect(201)
    ).body as SeparationView;
    expect(separation).toMatchObject({
      status: 'completed',
      noticeDaysRequired: 120,
      noticeShortfallDays: 90,
    });

    const detail = (await api(app).get(`/tenant/employees/${person.id}`).set(bearer(hr)))
      .body as EmployeeDetail;
    expect(detail).toMatchObject({ status: 'separated', separatedOn: yesterday });
    const history = (
      await api(app).get(`/tenant/employees/${person.id}/job-history`).set(bearer(hr))
    ).body as JobAssignmentView[];
    expect(history[0]!.effectiveTo).toBe(yesterday);

    const refused = await api(app)
      .post('/auth/login')
      .send({ tenant: 'my-group', email, password })
      .expect(403);
    expect(refused.body.code).toBe('login_disabled');
    await api(app).post('/auth/refresh').send({ refreshToken: login.refreshToken }).expect(401);
    await api(app)
      .post(`/tenant/employees/${person.id}/separations`)
      .set(bearer(hr))
      .send({
        type: 'dismissal',
        noticeDate: yesterday,
        lastWorkingDay: yesterday,
        reason: 'Twice',
      })
      .expect(409);
  });

  // ── Probation and job history ──────────────────────────────────────────────

  it('sets probation by the Act, lists it when due, and extends it only as far as allowed', async () => {
    // Staff do clerical work: six months' probation.
    const joined = addDays(todayIn(), -170);
    const person = await hire(
      { joinedOn: joined },
      {
        designationId: ref(org.designations, 'HRE'),
        employmentType: 'probationer',
        workerCategory: 'staff',
      },
    );
    expect(person.probationEndsOn).not.toBeNull();
    const overview = (await api(app).get('/tenant/lifecycle').set(bearer(hr)))
      .body as LifecycleOverview;
    const item = overview.probations.find((p) => p.employee.id === person.id)!;
    expect(item).toMatchObject({ probationEndsOn: person.probationEndsOn, deemedPermanent: false });

    const tooLong = await api(app)
      .post(`/tenant/employees/${person.id}/probation/extend`)
      .set(bearer(hr))
      .send({ until: addDays(item.latestEnd, 1), reason: 'Needs more time' })
      .expect(400);
    expect(tooLong.body.message).toMatch(/s\.4/);
    await api(app)
      .post(`/tenant/employees/${person.id}/probation/extend`)
      .set(bearer(hr))
      .send({ until: item.latestEnd, reason: 'Work could not be judged in time' })
      .expect(201);
  });

  it('back-dates a change and carries it into later history, and corrects an entry', async () => {
    const person = await hire();
    const change = (body: object) =>
      api(app)
        .post(`/tenant/employees/${person.id}/job-changes`)
        .set(bearer(hr))
        .send(body)
        .expect(201);
    await change({
      event: 'promotion',
      effectiveFrom: '2026-01-01',
      reason: 'Promoted',
      changes: { designationId: ref(org.designations, 'SSO'), gradeId: ref(org.grades, 'W4') },
    });
    // Moved to Line 2 back in June 2025: the later promotion keeps the move.
    await change({
      event: 'transfer',
      effectiveFrom: '2025-06-01',
      reason: 'Moved to Line 2',
      changes: { orgUnitId: ref(org.orgUnits, 'MGT-L2') },
    });
    const history = async () =>
      (
        (await api(app).get(`/tenant/employees/${person.id}/job-history`).set(bearer(hr)))
          .body as JobAssignmentView[]
      ).toSorted((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    let rows = await history();
    expect(rows.map((r) => [r.event, r.effectiveFrom, r.effectiveTo, r.orgUnit?.name])).toEqual([
      ['hire', '2025-01-01', '2025-05-31', 'Line 1'],
      ['transfer', '2025-06-01', '2025-12-31', 'Line 2'],
      ['promotion', '2026-01-01', null, 'Line 2'],
    ]);

    // The hire was on grade W3, not W5: later entries follow, except where they changed it.
    await api(app)
      .patch(`/tenant/employees/${person.id}/jobs/${rows[0]!.id}`)
      .set(bearer(hr))
      .send({ changes: { gradeId: ref(org.grades, 'W3') }, reason: 'Wrong grade at hiring' })
      .expect(200);
    rows = await history();
    expect(rows.map((r) => r.grade?.name)).toEqual([
      'Worker grade 3',
      'Worker grade 3',
      'Worker grade 4',
    ]);
  });

  // ── Letters ────────────────────────────────────────────────────────────────

  it('issues numbered letters in English and Bangla as PDFs in the employee’s documents', async () => {
    const person = await hire({ joinedOn: '2026-10-01' }, { employmentType: 'probationer' });
    const templates = (await api(app).get('/tenant/letter-templates').set(bearer(hr)).expect(200))
      .body as LetterTemplateView[];
    expect(templates.length).toBe(12);
    const appointment = (language: string) =>
      templates.find((t) => t.code === 'appointment' && t.language === language)!;
    expect(appointment('en').extraFields).toEqual(['extra.grossWages']);

    const preview = await api(app)
      .post(`/tenant/employees/${person.id}/letters/preview`)
      .set(bearer(hr))
      .send({ templateId: appointment('en').id })
      .expect(200);
    expect(preview.body.missing).toEqual(['extra.grossWages']);
    const missing = await api(app)
      .post(`/tenant/employees/${person.id}/letters`)
      .set(bearer(hr))
      .send({ templateId: appointment('en').id })
      .expect(400);
    expect(missing.body.code).toBe('missing_fields');

    const issue = async (language: string) =>
      (
        await api(app)
          .post(`/tenant/employees/${person.id}/letters`)
          .set(bearer(hr))
          .send({ templateId: appointment(language).id, extra: { grossWages: '12,800' } })
          .expect(201)
      ).body as DocumentView;
    const english = await issue('en');
    const bangla = await issue('bn');
    expect(english).toMatchObject({
      category: 'letter',
      source: 'generated',
      visibleToEmployee: true,
    });
    const year = todayIn().slice(0, 4);
    expect(english.refNo).toMatch(new RegExp(`^MGT/HR/${year}/\\d{4}$`));
    expect(Number(bangla.refNo!.slice(-4))).toBe(Number(english.refNo!.slice(-4)) + 1);
    expect(isPdf((await fileOf(hr, bangla.id).expect(200)).body as Buffer)).toBe(true);
  });

  it('lets HR edit a letter and go back to the standard text', async () => {
    const templates = (await api(app).get('/tenant/letter-templates').set(bearer(hr)))
      .body as LetterTemplateView[];
    const confirmation = templates.find((t) => t.code === 'confirmation' && t.language === 'en')!;
    const edited = (
      await api(app)
        .patch(`/tenant/letter-templates/${confirmation.id}`)
        .set(bearer(hr))
        .send({ body: `${confirmation.body}\n\nYour new salary is Tk {{extra.salary}}.` })
        .expect(200)
    ).body as LetterTemplateView;
    expect(edited).toMatchObject({ customized: true, extraFields: ['extra.salary'] });
    const reset = (
      await api(app)
        .post(`/tenant/letter-templates/${confirmation.id}/reset`)
        .set(bearer(hr))
        .expect(201)
    ).body as LetterTemplateView;
    expect(reset).toMatchObject({ customized: false, body: confirmation.body });
  });

  it('prints ID cards and the service book', async () => {
    const cards = await binary(
      api(app)
        .post('/tenant/id-cards')
        .set(bearer(hr))
        .send({ employeeIds: [ids.get('MG-0005'), ids.get('MG-0006')], language: 'bn' }),
    ).expect(200);
    expect(cards.headers['content-type']).toBe('application/pdf');
    expect(isPdf(cards.body as Buffer)).toBe(true);
    const book = await binary(
      api(app)
        .get(`/tenant/employees/${ids.get('MG-0005')}/service-book?language=bn`)
        .set(bearer(hr)),
    ).expect(200);
    expect(isPdf(book.body as Buffer)).toBe(true);
    const mine = await binary(api(app).get('/tenant/me/service-book').set(bearer(worker))).expect(
      200,
    );
    expect(isPdf(mine.body as Buffer)).toBe(true);
  });

  // ── Import ─────────────────────────────────────────────────────────────────

  it('imports employees from Excel after checking every row, and only when asked', async () => {
    const template = await binary(
      api(app).get('/tenant/imports/employees/template').set(bearer(hr)),
    ).expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(template.body as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('Employees')!;
    expect(wb.getWorksheet('Lists')).toBeDefined();
    const stamp = Date.now().toString(36).toUpperCase();
    // A saved workbook keeps headers, not column keys: fill cells in header order.
    const headers = (sheet.getRow(1).values as string[]).slice(1);
    const row = (code: string, extra: Record<string, string | Date> = {}) => {
      const values: Record<string, string | Date> = {
        employee_code: code,
        full_name: 'Kulsum Begum',
        father_name: 'Rahim Uddin',
        mother_name: 'Sufia Khatun',
        date_of_birth: new Date('1999-03-10'),
        gender: 'female',
        mobile_phone: '1912345678', // typed as a number: the leading zero is gone
        nid: `${Date.now()}`.slice(-10),
        present_address: 'Tongi',
        present_district: 'Gazipur',
        present_division: 'dhaka',
        joined_on: '2026-10-20',
        legal_entity: 'MGT',
        location: 'GZP',
        org_unit: 'MGT-L2',
        designation: 'SO',
        employment_type: 'probationer',
        worker_category: 'worker',
        ...extra,
      };
      sheet.addRow(headers.map((h) => values[h] ?? null));
    };
    row(`IMP-${stamp}-1`, { designation: 'LS', nid: `${Date.now() + 1}`.slice(-10) });
    row(`IMP-${stamp}-2`, { nid: '123', designation: 'NOPE' });
    row(`IMP-${stamp}-3`, {
      manager: `IMP-${stamp}-1`,
      nid: `${Date.now() + 2}`.slice(-10),
      attendance_pin: `9${stamp.slice(-4)}`,
    });
    const file = Buffer.from(await wb.xlsx.writeBuffer());

    const batch = (
      await api(app)
        .post('/tenant/imports/employees')
        .set(bearer(hr))
        .attach('file', file, 'people.xlsx')
        .expect(201)
    ).body;
    expect(batch).toMatchObject({ status: 'validated', totalRows: 3, validRows: 2 });
    expect(batch.rows).toHaveLength(1);
    expect(batch.rows[0].errors.map((e: { column: string }) => e.column).toSorted()).toEqual([
      'designation',
      'nid',
    ]);

    await api(app)
      .post(`/tenant/imports/employees/${batch.id}/commit`)
      .set(bearer(hr))
      .send({})
      .expect(400);
    const done = (
      await api(app)
        .post(`/tenant/imports/employees/${batch.id}/commit`)
        .set(bearer(hr))
        .send({ onlyValid: true })
        .expect(201)
    ).body;
    expect(done).toMatchObject({ status: 'committed', imported: 2 });
    const third = (await api(app).get(`/tenant/employees?search=IMP-${stamp}-3`).set(bearer(hr)))
      .body.items[0];
    const detail = (await api(app).get(`/tenant/employees/${third.id}`).set(bearer(hr))).body;
    expect(detail.mobilePhone).toBe('+8801912345678');
    expect(detail.currentJob.manager.employeeCode).toBe(`IMP-${stamp}-1`);
    await api(app)
      .post(`/tenant/imports/employees/${batch.id}/commit`)
      .set(bearer(hr))
      .send({ onlyValid: true })
      .expect(400);
  });

  // ── Selfie punches ─────────────────────────────────────────────────────────

  it('asks for a selfie with app punches when the workspace requires one', async () => {
    await settings({ requireSelfie: true });
    try {
      const gazipur = { latitude: '24.0023', longitude: '90.3474' };
      const without = await api(app)
        .post('/tenant/me/attendance/punch')
        .set(bearer(manager))
        .send({ source: 'mobile', ...gazipur })
        .expect(400);
      expect(without.body.code).toBe('selfie_required');
      const punched = (
        await api(app)
          .post('/tenant/me/attendance/punch')
          .set(bearer(manager))
          .field('source', 'mobile')
          .field('latitude', gazipur.latitude)
          .field('longitude', gazipur.longitude)
          .attach('selfie', JPEG, 'selfie.jpg')
          .expect(201)
      ).body;
      const selfieId = punched.punches.at(-1).selfieDocumentId;
      expect(selfieId).toBeTruthy();
      expect(Buffer.compare((await fileOf(hr, selfieId).expect(200)).body as Buffer, JPEG)).toBe(0);
    } finally {
      await settings({ requireSelfie: false });
    }
  });

  it('keeps a workspace’s documents away from another workspace', async () => {
    const ngo = (
      await api(app)
        .post('/auth/login')
        .send({
          tenant: 'sponsored-ngo',
          email: 'admin@sponsored-ngo.test',
          password: testEnv().password,
        })
        .expect(200)
    ).body.accessToken as string;
    const doc = (
      await upload(ids.get('MG-0005')!, PDF, 'contract.pdf', {
        category: 'contract',
        title: 'Employment contract',
      }).expect(201)
    ).body as DocumentView;
    await fileOf(ngo, doc.id).expect(404);
  });
});
