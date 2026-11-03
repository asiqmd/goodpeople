import { createHmac, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  createDb,
  runAsTenant,
  employeeIdentifiers,
  employeePaymentAccounts,
  merchantLedger,
  jobAssignments,
  createFieldCipher,
} from '@gp/db';
import { eq, sql } from 'drizzle-orm';
import { api, bearer, bootApp, platformToken, testEnv, uniqueSlug } from './test-env.js';
import { totpAt } from '../src/modules/auth/totp.js';
import {
  testMerchantAdapter,
  recordMerchantEvent,
} from '../src/modules/international/merchant-adapter.js';
describe('international employer, employee and commercial boundaries', () => {
  let app: INestApplication,
    owner: ReturnType<typeof createDb>,
    token: string,
    platform: string,
    tenantId: string,
    bd: string,
    ae: string,
    sa: string,
    employeeId: string;
  const request = () => api(app),
    headers = () => bearer(token),
    secret = 'synthetic-m4-contract-secret';
  beforeAll(async () => {
    app = await bootApp();
    owner = createDb(testEnv().ownerUrl);
    platform = await platformToken(app);
    const slug = uniqueSlug('international');
    const assigned = (
      await request()
        .post('/platform/tenants')
        .set(bearer(platform))
        .send({
          name: 'M4 isolated sandbox',
          slug,
          industryTemplate: 'corporate',
          billingMode: 'internal',
          planCode: 'enterprise',
          reason: 'Isolated international acceptance',
          admin: { name: 'M4 administrator', email: `admin@${slug}.test` },
        })
        .expect(201)
    ).body;
    tenantId = assigned.tenant.id;
    const session = (
      await request()
        .post('/auth/login')
        .send({ tenant: slug, email: `admin@${slug}.test`, password: assigned.temporaryPassword })
        .expect(200)
    ).body;
    token = session.accessToken;
    const setup = (await request().post('/account/mfa/setup').set(headers()).expect(200)).body;
    await request()
      .post('/account/mfa/confirm')
      .set(headers())
      .send({ code: totpAt(setup.secret, new Date()) })
      .expect(200);
    for (const country of ['BD', 'AE', 'SA']) {
      const result = await request()
        .post('/tenant/international/companies')
        .set(headers())
        .send({ name: `Employer ${country}`, code: country, countryCode: country })
        .expect(201);
      if (country === 'BD') bd = result.body.id;
      if (country === 'AE') ae = result.body.id;
      if (country === 'SA') sa = result.body.id;
    }
    const address = { line: 'Street 1', district: 'Dubai', division: 'Dubai', countryCode: 'AE' };
    employeeId = (
      await request()
        .post('/tenant/employees')
        .set(headers())
        .send({
          employmentCountry: 'AE',
          nationality: 'IN',
          employeeCode: 'AE-1',
          fullName: 'Original Name',
          dateOfBirth: '1990-01-01',
          gender: 'female',
          mobilePhone: '+971501234567',
          presentAddress: address,
          permanentAddress: address,
          identity: {},
          joinedOn: '2026-01-01',
          job: { legalEntityId: ae, employmentType: 'permanent', workerCategory: 'staff' },
        })
        .expect(201)
    ).body.employee.id;
  });
  afterAll(async () => {
    await owner?.pool.end();
    await app?.close();
  });
  it('exposes legal-employer country and preserves explicit site zones and rest patterns', async () => {
    const company = (
      await request()
        .get('/tenant/legal-entities/' + ae)
        .set(headers())
        .expect(200)
    ).body;
    expect(company.countryCode).toBe('AE');
    const input = {
      legalEntityId: ae,
      name: 'M4 explicit international site',
      code: 'M4-SITE',
      kind: 'branch',
      weeklyOffDays: [0, 6],
      timeZone: 'Europe/London',
    };
    const site = (await request().post('/tenant/locations').set(headers()).send(input).expect(201))
      .body;
    expect(site).toMatchObject({
      countryCode: 'AE',
      timeZone: 'Europe/London',
      weeklyOffDays: [0, 6],
    });
    const missing = { ...input, weeklyOffDays: undefined };
    await request()
      .post('/tenant/locations')
      .set(headers())
      .send({ ...missing, code: 'M4-MISSING-REST' })
      .expect(400);
  });
  it('requires explicit foreign citizenship and does not infer BD probation dates', async () => {
    const address = { line: 'Street 2', district: 'Dubai', division: 'Dubai', countryCode: 'AE' };
    const body = {
      employmentCountry: 'AE',
      employeeCode: 'AE-PROBATION',
      fullName: 'Synthetic overseas probation record',
      dateOfBirth: '2011-01-01',
      gender: 'female',
      mobilePhone: '+971501234568',
      presentAddress: address,
      permanentAddress: address,
      identity: {},
      joinedOn: '2026-01-01',
      job: { legalEntityId: ae, employmentType: 'probationer', workerCategory: 'staff' },
    };
    await request().post('/tenant/employees').set(headers()).send(body).expect(400);
    const result = (
      await request()
        .post('/tenant/employees')
        .set(headers())
        .send({ ...body, nationality: 'IN' })
        .expect(201)
    ).body.employee;
    expect(result.probationEndsOn).toBeNull();
    expect(result.isAdolescent).toBe(false);
    await request()
      .patch('/tenant/employees/' + result.id)
      .set(headers())
      .send({
        presentAddress: { line: 'A different address', district: 'Dhaka', division: 'dhaka' },
      })
      .expect(400);
  });
  it('supports an explicit BD pay group inside a mixed-country workspace and snapshots rule versions', async () => {
    const group = (
      await request()
        .post('/tenant/payroll/pay-groups')
        .set(headers())
        .send({
          code: 'M4-BD',
          name: 'Explicit BD context',
          legalEntityId: bd,
          currency: 'BDT',
          frequency: 'monthly',
        })
        .expect(201)
    ).body;
    const run = (
      await request()
        .post('/tenant/payroll/runs')
        .set(headers())
        .send({ payGroupId: group.id, month: '2026-11' })
        .expect(201)
    ).body;
    const result = (
      await request()
        .post('/tenant/payroll/runs/' + run.id + '/compute')
        .set(headers())
        .send({})
        .expect(200)
    ).body;
    expect(result.currency).toBe('BDT');
    expect(result.statutoryContext).toMatchObject({
      country: 'BD',
      calendar: 'gregorian',
      implementationVersion: '5.4.0',
    });
    expect(result.statutoryContext.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('preserves dated Gregorian context before an unqualified Hijri requirement starts', async () => {
    await request()
      .post('/tenant/international/profiles')
      .set(headers())
      .send({
        legalEntityId: bd,
        countryCode: 'BD',
        regime: 'BD_PRIVATE',
        currency: 'BDT',
        businessTimeZone: 'Asia/Dhaka',
        calendar: 'hijri_required',
        effectiveFrom: '2027-01-01',
        reason: 'Future calendar qualification fixture',
      })
      .expect(201);
    const before = (
      await request()
        .get('/tenant/international/clock/' + bd + '?instant=2026-12-30T12:00:00Z')
        .set(headers())
        .expect(200)
    ).body;
    const after = (
      await request()
        .get('/tenant/international/clock/' + bd + '?instant=2027-01-02T12:00:00Z')
        .set(headers())
        .expect(200)
    ).body;
    expect(before.calendar).toBe('gregorian');
    expect(after.calendar).toBe('hijri_required');
    expect(after.statutoryReady).toBe(false);
    expect(after.hijriConversion).toBe('not_qualified');
  });
  it('registers country-specific defaults without claiming payroll qualification', async () => {
    const data = (await request().get('/tenant/international').set(headers()).expect(200)).body;
    expect(data.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legalEntityId: bd,
          currency: 'BDT',
          businessTimeZone: 'Asia/Dhaka',
        }),
        expect.objectContaining({
          legalEntityId: ae,
          currency: 'AED',
          businessTimeZone: 'Asia/Dubai',
          reviewStatus: 'needs_review',
        }),
        expect.objectContaining({
          legalEntityId: sa,
          currency: 'SAR',
          businessTimeZone: 'Asia/Riyadh',
        }),
      ]),
    );
    expect(data.commercialGate.enabled).toBe(false);
  });
  it('resolves company dates from UTC and rejects implicit mixed statutory context', async () => {
    const instant = '2026-12-31T20:30:00Z';
    const result = (
      await request()
        .get(`/tenant/international/clock/${sa}?instant=${instant}`)
        .set(headers())
        .expect(200)
    ).body;
    expect(result.date).toBe('2026-12-31');
    expect(result.statutoryReady).toBe(false);
    await request()
      .post(`/tenant/employees/${employeeId}/letters/preview`)
      .set(headers())
      .send({ kind: 'appointment', language: 'en' })
      .expect(409);
    await request().get('/tenant/payroll/pay-groups').set(headers()).expect(409);
    await request().post('/tenant/international/checkout').set(headers()).send({}).expect(409);
  });
  it('records encrypted issued identifiers and masks all reads, with RLS isolation', async () => {
    const value = 'P-TEST-123456';
    await request()
      .post('/tenant/international/identifiers')
      .set(headers())
      .send({
        employeeId,
        kind: 'passport',
        issuer: 'IN',
        value,
        validFrom: '2026-01-01',
        validTo: '2030-01-01',
      })
      .expect(201);
    const visible = (
      await request()
        .get(`/tenant/international/employees/${employeeId}`)
        .set(headers())
        .expect(200)
    ).body;
    expect(visible.identifiers[0]).toMatchObject({ issuer: 'IN', last4: '3456' });
    expect(JSON.stringify(visible)).not.toContain(value);
    const [row] = await runAsTenant(owner.db, tenantId, (tx) =>
      tx.select().from(employeeIdentifiers).where(eq(employeeIdentifiers.employeeId, employeeId)),
    );
    expect(row!.valueEnc).not.toContain(value);
    expect(
      createFieldCipher(testEnv().fieldKey).decrypt(row!.valueEnc, {
        tenantId,
        field: 'international.identifier',
      }),
    ).toBe(value);
    expect(
      await runAsTenant(owner.db, randomUUID(), (tx) => tx.select().from(employeeIdentifiers)),
    ).toEqual([]);
  });
  it('preserves original names and unconverted Hijri provenance in versioned profiles', async () => {
    const originalName = '\u0646\u0648\u0631 \u0623\u062d\u0645\u062f';
    const profile = {
      employeeId,
      effectiveFrom: '2026-01-01',
      citizenship: 'IN',
      insuranceClass: 'unreviewed',
      contractClass: 'fixed_term',
      originalName,
      suppliedHijriDate: '1448-06-22',
      calendarProvenance: 'Original contract; no reviewed conversion',
      reason: 'Original employee contract record',
    };
    await request()
      .post('/tenant/international/employment-profiles')
      .set(headers())
      .send(profile)
      .expect(201);
    await request()
      .post('/tenant/international/employment-profiles')
      .set(headers())
      .send({ ...profile, effectiveFrom: '2027-01-01' })
      .expect(201);
    const data = (
      await request()
        .get(`/tenant/international/employees/${employeeId}`)
        .set(headers())
        .expect(200)
    ).body;
    expect(data.profiles).toHaveLength(2);
    expect(
      data.profiles.find((p: { effectiveFrom: string }) => p.effectiveFrom === '2026-01-01'),
    ).toMatchObject({ originalName, effectiveTo: '2026-12-31', suppliedHijriDate: '1448-06-22' });
  });
  it('accepts only a matching country, currency and verified IBAN, storing ciphertext', async () => {
    const input = {
      employeeId,
      legalEntityId: ae,
      provider: 'Synthetic bank',
      accountName: 'Original Name',
      destination: { country: 'AE', currency: 'AED', iban: 'AE070331234567890123456' },
    };
    const result = (
      await request().post('/tenant/international/banks').set(headers()).send(input).expect(201)
    ).body;
    expect(result).toMatchObject({ currency: 'AED', accountNumberLast4: '3456' });
    await request()
      .post('/tenant/international/banks')
      .set(headers())
      .send({ ...input, destination: { ...input.destination, currency: 'BDT' } })
      .expect(400);
    const [row] = await runAsTenant(owner.db, tenantId, (tx) =>
      tx
        .select()
        .from(employeePaymentAccounts)
        .where(eq(employeePaymentAccounts.employeeId, employeeId)),
    );
    expect(row!.accountNumberEnc).not.toContain(input.destination.iban);
    expect(
      createFieldCipher(testEnv().fieldKey).decrypt(row!.accountNumberEnc!, {
        tenantId,
        field: 'employee_payment_accounts.account_number',
      }),
    ).toBe(input.destination.iban);
  });
  it('blocks payroll for foreign jobs and cross-employer continuity without review', async () => {
    await expect(
      runAsTenant(owner.db, tenantId, (tx) =>
        tx.execute(
          sql`select gp_assert_bd_context(${tenantId}::uuid,${ae}::uuid,'2026-11-01'::date)`,
        ),
      ),
    ).rejects.toThrow();
    const [job] = await runAsTenant(owner.db, tenantId, (tx) =>
      tx.select().from(jobAssignments).where(eq(jobAssignments.employeeId, employeeId)),
    );
    await expect(
      runAsTenant(owner.db, tenantId, (tx) =>
        tx.insert(jobAssignments).values({
          tenantId,
          employeeId,
          event: 'transfer',
          effectiveFrom: '2027-01-01',
          legalEntityId: sa,
          employmentType: job!.employmentType,
          workerCategory: job!.workerCategory,
        }),
      ),
    ).rejects.toThrow();
  });
  it('restricts commercial price books to platform finance, with explicit USD/AED and no checkout', async () => {
    const input = {
      planCode: 'enterprise',
      currency: 'USD',
      seatPrice: '49.00',
      effectiveFrom: '2027-01-01',
      merchantProduct: 'unqualified-product',
      merchantPrice: 'unqualified-price',
      reason: 'Contract fixture; no merchant approval',
    };
    await request().post('/platform/international/prices').set(headers()).send(input).expect(403);
    await request()
      .post('/platform/international/prices')
      .set(bearer(platform))
      .send(input)
      .expect(201);
    const data = (
      await request().get('/platform/international/prices').set(bearer(platform)).expect(200)
    ).body;
    expect(data.checkoutEnabled).toBe(false);
    expect(data.prices).toEqual(
      expect.arrayContaining([expect.objectContaining({ currency: 'USD', seatPrice: '49.00' })]),
    );
  });
  it('verifies exact signed bytes, deduplicates, bounds refunds/credits and reconciles by currency', async () => {
    const adapter = testMerchantAdapter(secret),
      now = new Date(),
      invoice = randomUUID();
    const append = (
      kind: string,
      amount: string,
      changes: Record<string, unknown> = {},
      signedChanges = false,
    ) => {
      const data = {
        id: randomUUID(),
        tenantId,
        kind,
        currency: 'USD',
        amount,
        invoice,
        reference: 'contract-reference',
        occurredAt: now.toISOString(),
        ...changes,
      };
      const raw = Buffer.from(JSON.stringify(data)),
        stamp = String(Math.floor(now.getTime() / 1000)),
        signature =
          stamp +
          '.' +
          createHmac('sha256', secret)
            .update(stamp + '.')
            .update(raw)
            .digest('hex');
      return {
        raw,
        signature: signedChanges ? signature + 'x' : signature,
        run: () =>
          owner.db.transaction((tx) => recordMerchantEvent(tx, adapter, raw, signature, now)),
      };
    };
    const payment = append('payment', '100.00');
    expect(await payment.run()).toMatchObject({ duplicate: false });
    expect(await payment.run()).toMatchObject({ duplicate: true });
    await expect(
      append('payment', '101.00', { id: JSON.parse(payment.raw.toString()).id }).run(),
    ).rejects.toThrow('merchant_event_payload_conflict');
    await append('refund', '20.00').run();
    await append('credit', '10.00').run();
    await expect(append('refund', '71.00').run()).rejects.toThrow();
    await expect(append('reconciliation', '71.00').run()).rejects.toThrow();
    await expect(append('payment', '1.00', { currency: 'AED' }).run()).rejects.toThrow();
    await append('reconciliation', '70.00').run();
    expect(() =>
      adapter.verify(
        Buffer.from(payment.raw.toString().replace('100.00', '900.00')),
        payment.signature,
        now,
      ),
    ).toThrow();
    expect(() =>
      adapter.verify(payment.raw, payment.signature, new Date(now.getTime() + 600000)),
    ).toThrow();
    const ledger = await owner.db
      .select()
      .from(merchantLedger)
      .where(eq(merchantLedger.externalInvoice, invoice));
    expect(ledger).toHaveLength(4);
  });
});
