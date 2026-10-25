import type { AuditReportView, OrgSnapshot } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { SEED_FINANCE_EMAIL } from '@gp/db';
import { loginAs } from './leave-helpers.js';
import { binary, isPdf } from './payroll-helpers.js';
import { api, bearer, bootApp, tenantLogin } from './test-env.js';

describe('the buyer-audit report', () => {
  let app: INestApplication;
  let admin: string;
  // The seed's punches cover 1–23 October 2026.
  const from = '2026-10-01';
  const to = '2026-10-23';
  const report = (query: string, token = admin) =>
    api(app).get(`/tenant/compliance/audit-report?${query}`).set(bearer(token));

  beforeAll(async () => {
    app = await bootApp();
    admin = (await tenantLogin(app, 'my-group')).accessToken;
    await api(app)
      .post('/tenant/attendance/process')
      .set(bearer(admin))
      .send({ from, to })
      .expect(201);
  });
  afterAll(() => app.close());

  it('reads the workforce, hours and wages from the records for a period', async () => {
    const view = (await report(`from=${from}&to=${to}`).expect(200)).body as AuditReportView;
    expect(view).toMatchObject({ from, to, establishment: { entity: null, location: null } });
    expect(view.workforce.total).toBeGreaterThanOrEqual(10);
    expect(view.workforce.workers + view.workforce.staff).toBe(view.workforce.total);
    expect(view.workforce.children).toBe(0);
    // MG-0010 is 16 and has no certificate of fitness on file.
    expect(view.workforce.adolescents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MG-0010', certificateUntil: null }),
      ]),
    );
    expect(view.hours.tracked).toBe(true);
    expect(view.hours.workerWeeks).toBeGreaterThan(0);
    expect(view.wages.onWageBoard).toBeGreaterThan(0);
    expect(view.wages.belowMinimum).toEqual([]);
    expect(Array.isArray(view.leave.byType)).toBe(true);
    expect(view.grievances.total).toBeGreaterThanOrEqual(0);
  });

  it('narrows to a company, and refuses a site outside it', async () => {
    const org = (await api(app).get('/tenant/org').set(bearer(admin)).expect(200))
      .body as OrgSnapshot;
    const textiles = org.legalEntities.find((e) => e.code === 'MGT') ?? org.legalEntities[0]!;
    const foods = org.legalEntities.find((e) => e.id !== textiles.id)!;
    const all = (await report(`from=${from}&to=${to}`).expect(200)).body as AuditReportView;
    const one = (await report(`from=${from}&to=${to}&legalEntityId=${textiles.id}`).expect(200))
      .body as AuditReportView;
    expect(one.establishment.entity).toBeTruthy();
    expect(one.workforce.total).toBeLessThanOrEqual(all.workforce.total);
    const elsewhere = org.locations.find((l) => l.legalEntityId === foods.id);
    if (elsewhere) {
      expect(
        (
          await report(
            `from=${from}&to=${to}&legalEntityId=${textiles.id}&locationId=${elsewhere.id}`,
          ).expect(400)
        ).body.code,
      ).toBe('scope_mismatch');
    }
    await report(`from=${to}&to=${from}`).expect(400);
  });

  it('prints in English and Bangla, and gives the weekly hours as CSV', async () => {
    for (const language of ['en', 'bn']) {
      const pdf = await binary(
        report(`from=${from}&to=${to}&format=pdf&language=${language}`),
      ).expect(200);
      expect(isPdf(pdf.body as Buffer)).toBe(true);
    }
    const sheet = await report(`from=${from}&to=${to}&format=csv`).expect(200);
    expect(sheet.headers['content-disposition']).toContain('attachment');
    expect(sheet.text.split('\n')[0]).toContain('Employee code');
  });

  it('is for those who manage compliance only', async () => {
    // A finance officer reads payroll but not compliance.
    const finance = await loginAs(app, SEED_FINANCE_EMAIL);
    await report(`from=${from}&to=${to}`, finance).expect(403);
  });
});
