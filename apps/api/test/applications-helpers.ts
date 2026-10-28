import { createDb, jobOpenings, runAsTenant, tenants, type Tx } from '@gp/db';
import type {
  CandidateAdded,
  EmployeeDetail,
  OpeningStatus,
  OrgSnapshot,
  WorkspaceUserCreated,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type LogSender,
} from '../src/modules/notifications/senders.js';
import { api, bearer, tenantLogin, testEnv } from './test-env.js';

// People, openings and candidates in the seeded my-group workspace for the recruitment tests.
// Every helper makes new rows with unique values, so tests pass in any order.

export type Company = 'MGT' | 'MGF';

const address = { line: 'Konabari', district: 'Gazipur', division: 'dhaka' };
const ref = <T extends { id: string; code: string | null }>(rows: T[], code: string) =>
  rows.find((r) => r.code === code)!.id;

/** A one-page PDF with these lines, as a CV. */
export async function pdfCv(lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  lines.forEach((text, i) => page.drawText(text, { x: 50, y: 760 - i * 20, size: 12, font }));
  return Buffer.from(await pdf.save());
}

/** A time n days from now, on the minute. */
export const inDays = (days: number, minutes = 0) => {
  const at = new Date(Date.now() + days * 86_400_000 + minutes * 60_000);
  at.setUTCSeconds(0, 0);
  return at.toISOString();
};

export async function recruitmentKit(app: INestApplication) {
  const admin = (await tenantLogin(app, 'my-group')).accessToken;
  const org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200))
    .body as OrgSnapshot;
  const { db, pool } = createDb(testEnv().ownerUrl, { max: 2 });
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
  const tenantId = tenant!.id;
  const mail = app.get<LogSender<EmailMessage>>(EMAIL_SENDER);
  let seq = 0;
  const unique = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;
  const company = (code: Company) => ref(org.legalEntities, code);
  /** Reads and writes inside the workspace, as row-level security requires. */
  const inTenant = <T>(fn: (tx: Tx) => Promise<T>) => runAsTenant(db, tenantId, fn);

  const signIn = async (email: string) =>
    (
      await api(app)
        .post('/auth/login')
        .send({ tenant: 'my-group', email, password: testEnv().password })
        .expect(200)
    ).body.accessToken as string;

  /** An employee of the company, with a login unless the role is null. */
  async function person(code: Company = 'MGT', role: string | null = 'employee') {
    const employeeCode = `RC-${unique().toUpperCase()}`;
    const email = `${employeeCode.toLowerCase()}@example.test`;
    const job =
      code === 'MGT'
        ? { locationId: ref(org.locations, 'GZP'), orgUnitId: ref(org.orgUnits, 'MGT-L1') }
        : { locationId: ref(org.locations, 'NRJ'), orgUnitId: ref(org.orgUnits, 'MGF-PROD') };
    const employee = (
      await api(app)
        .post('/tenant/employees')
        .set(bearer(admin))
        .send({
          employeeCode,
          fullName: `Recruit Test ${employeeCode}`,
          fatherName: 'Abdul Karim',
          motherName: 'Hosne Ara',
          dateOfBirth: '1990-03-15',
          gender: 'male',
          mobilePhone: '01812345678',
          presentAddress: address,
          permanentAddress: address,
          identity: { nid: `${Date.now()}${seq++}`.slice(-10) },
          joinedOn: '2024-01-01',
          job: {
            legalEntityId: company(code),
            ...job,
            designationId: ref(org.designations, 'SO'),
            gradeId: ref(org.grades, 'W5'),
            employmentType: 'permanent',
            workerCategory: 'worker',
          },
          ...(role ? { portalAccess: { email, role, password: testEnv().password } } : {}),
        })
        .expect(201)
    ).body.employee as EmployeeDetail;
    return { employee, email, token: role ? await signIn(email) : '' };
  }

  /** A workspace login without an employee record, limited to companies when given. */
  async function staff(role: string, companies?: Company[]) {
    const email = `rc-staff-${unique()}@example.test`;
    const user = (
      await api(app)
        .post('/tenant/users')
        .set(bearer(admin))
        .send({ name: `Recruiter ${role}`, email, role, password: testEnv().password })
        .expect(201)
    ).body as WorkspaceUserCreated;
    if (companies) {
      await api(app)
        .put(`/tenant/users/${user.id}/scopes`)
        .set(bearer(admin))
        .send({ legalEntityIds: companies.map(company) })
        .expect(200);
    }
    return { user, email, token: await signIn(email) };
  }

  /** An opening, written straight to the table (the openings API is built alongside). */
  async function opening(
    fields: {
      company?: Company;
      hiringManagerEmployeeId?: string | null;
      criteria?: string[];
      status?: OpeningStatus;
      postTitleBn?: string | null;
    } = {},
  ) {
    const title = `Opening ${unique()}`;
    const [row] = await inTenant((tx) =>
      tx
        .insert(jobOpenings)
        .values({
          tenantId,
          legalEntityId: company(fields.company ?? 'MGT'),
          title,
          employmentType: 'permanent',
          hiringManagerEmployeeId: fields.hiringManagerEmployeeId ?? null,
          status: fields.status ?? 'open',
          postTitleEn: `Post ${title}`,
          postTitleBn: fields.postTitleBn ?? null,
          scorecardCriteria: fields.criteria ?? [],
        })
        .returning(),
    );
    return row!;
  }

  /** Adds a person to an opening by hand; returns the response for the caller to check. */
  function add(
    openingId: string,
    fields: Record<string, string> = {},
    cv?: { bytes: Buffer; name: string },
    token = admin,
  ) {
    const id = unique();
    const body: Record<string, string> = {
      openingId,
      fullName: `Candidate ${id}`,
      email: `candidate-${id}@example.com`,
      source: 'walk_in',
      consent: 'true',
      ...fields,
    };
    let req = api(app).post('/tenant/recruitment/candidates').set(bearer(token));
    for (const [key, value] of Object.entries(body)) req = req.field(key, value);
    if (cv) req = req.attach('cv', cv.bytes, cv.name);
    return req;
  }

  async function added(openingId: string, fields: Record<string, string> = {}, cv?: Buffer) {
    return (await add(openingId, fields, cv && { bytes: cv, name: 'cv.pdf' }).expect(201))
      .body as CandidateAdded;
  }

  /** A mobile number no other test uses. */
  const mobile = () => `017${String(Date.now() + seq++).slice(-8)}`;

  /** Emails sent to an address since a mark (`mail.sent.length` taken before). */
  const sentTo = (to: string, since = 0) => mail.sent.slice(since).filter((m) => m.to === to);

  return {
    admin,
    org,
    tenantId,
    inTenant,
    mail,
    unique,
    company,
    person,
    staff,
    opening,
    add,
    added,
    mobile,
    sentTo,
    close: () => pool.end(),
  };
}
