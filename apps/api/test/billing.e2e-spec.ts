import {
  createDb,
  employees,
  invoices,
  notifications,
  runAsTenant,
  subscriptions,
  tenants,
  type Database,
} from '@gp/db';
import {
  addDays,
  todayIn,
  type BillingOverview,
  type InvoiceView,
  type PartnerView,
  type StatementMatchView,
  type TenantAccessView,
} from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { and, eq, gte, isNull, like, lte, or } from 'drizzle-orm';
import { BillingJobs } from '../src/modules/billing/billing-jobs.service.js';
import { seatsOf } from '../src/modules/billing/billing.service.js';
import { binary, isPdf } from './payroll-helpers.js';
import {
  api,
  bearer,
  bootApp,
  platformToken,
  tenantLogin,
  testEnv,
  uniqueSlug,
} from './test-env.js';

const DAY = 86_400_000;
const monthOf = (date: string) => date.slice(0, 7);
const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const round2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

// Each test makes its own workspaces, so the tests pass in any order.
describe('billing', () => {
  let app: INestApplication;
  let db: Database;
  let pool: ReturnType<typeof createDb>['pool'];
  let platform: string;
  let jobs: BillingJobs;
  const stamp = Date.now().toString(36).toUpperCase();
  const today = todayIn();
  const lastMonth = monthOf(addDays(`${monthOf(today)}-01`, -1));
  const monthBefore = monthOf(addDays(`${lastMonth}-01`, -1));
  let couponSeq = 0;

  const overview = async (token: string) =>
    (await api(app).get('/tenant/billing').set(bearer(token)).expect(200)).body as BillingOverview;
  const access = async (token: string) =>
    (await api(app).get('/tenant/access').set(bearer(token)).expect(200)).body as TenantAccessView;
  const invoiceOf = async (id: string) =>
    (await api(app).get(`/platform/billing/invoices/${id}`).set(bearer(platform)).expect(200))
      .body as InvoiceView;
  const issue = (month: string) =>
    api(app).post('/platform/billing/issue').set(bearer(platform)).send({ month });
  const sent = (tenant: string, key: string) =>
    runAsTenant(db, tenant, (tx) =>
      tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(like(notifications.dedupeKey, `${key}%`)),
    );
  const choose = (token: string, body: Record<string, unknown> = {}) =>
    api(app)
      .post('/tenant/billing/plan')
      .set(bearer(token))
      .send({
        planCode: 'business',
        buyerName: 'Meghna Knit Composite Ltd',
        buyerAddress: 'Plot 12, BSCIC, Narayanganj',
        buyerBin: '004512369-0101',
        ...body,
      });

  async function newCoupon(body: Record<string, unknown>) {
    const code = `T${stamp}-${couponSeq++}`;
    await api(app)
      .post('/platform/billing/coupons')
      .set(bearer(platform))
      .send({ code, ...body })
      .expect(201);
    return code;
  }

  /** A workspace the platform assigns, signed in as its admin. */
  async function assign(body: Record<string, unknown>) {
    const slug = uniqueSlug('bill');
    const res = await api(app)
      .post('/platform/tenants')
      .set(bearer(platform))
      .send({
        name: `Billing ${slug}`,
        slug,
        industryTemplate: 'corporate',
        reason: 'Billing end-to-end test workspace',
        admin: { name: 'Billing Admin', email: `admin@${slug}.test`, password: testEnv().password },
        ...body,
      })
      .expect(201);
    const login = await api(app)
      .post('/auth/login')
      .send({ tenant: slug, email: `admin@${slug}.test`, password: testEnv().password })
      .expect(200);
    return { id: res.body.tenant.id as string, token: login.body.accessToken as string };
  }

  const trial = () =>
    assign({
      billingMode: 'trial',
      planCode: 'business',
      accessExpiresAt: new Date(Date.now() + 20 * DAY).toISOString(),
    });

  /**
   * A trial that chose Business on the 16th of the month before last, invoiced for that part
   * month and for last month: `first` and `second`.
   */
  async function invoicedWorkspace(couponCode?: string) {
    const workspace = await trial();
    await choose(workspace.token, couponCode ? { couponCode } : {}).expect(200);
    await db
      .update(subscriptions)
      .set({ startedOn: `${monthBefore}-16` })
      .where(eq(subscriptions.tenantId, workspace.id));
    await issue(monthBefore).expect(200);
    const issued = (await issue(lastMonth).expect(200)).body as { issued: number };
    const mine = (await overview(workspace.token)).invoices;
    const [second, first] = mine as [InvoiceView, InvoiceView];
    return { ...workspace, first, second, invoices: mine, issued: issued.issued };
  }

  beforeAll(async () => {
    app = await bootApp({ BILLING_FAKE_GATEWAY: 'on' });
    jobs = app.get(BillingJobs);
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    platform = await platformToken(app);
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('turns a trial into a paid plan chosen in the workspace, with a coupon', async () => {
    const { token } = await trial();
    const coupon = await newCoupon({ percentOff: 20, months: 1 });
    const before = await overview(token);
    expect(before).toMatchObject({ billingMode: 'trial', subscription: null });
    expect(before.gateways).toContain('fake');
    expect(before.quotes.map((q) => q.planCode)).toEqual(['starter', 'growth', 'business']);
    expect(before.quotes[2]!.price).toMatchObject({ staffSeat: '250.00', workerSeat: '80.00' });

    expect((await choose(token, { couponCode: 'NOPE-0000' }).expect(400)).body.code).toBe(
      'coupon_invalid',
    );
    await choose(token, { couponCode: coupon.toLowerCase() }).expect(200);
    // One coupon per workspace; changing plan keeps it.
    expect((await choose(token, { couponCode: coupon }).expect(409)).body.code).toBe(
      'coupon_already',
    );
    await choose(token, { planCode: 'growth' }).expect(200);
    await choose(token).expect(200);

    const now = await access(token);
    expect(now.tenant).toMatchObject({ billingMode: 'paid', planCode: 'business' });
    expect(now.access.accessState).toBe('full');
    const after = await overview(token);
    expect(after.subscription).toMatchObject({ status: 'active', startedOn: today });
    expect(after.coupon?.code).toBe(coupon);
    expect(after.buyer).toMatchObject({ bin: '004512369-0101' });

    // Workspaces we do not bill cannot choose a plan.
    const group = (await tenantLogin(app, 'my-group')).accessToken;
    expect(
      (await choose(group, { planCode: 'growth', buyerBin: undefined }).expect(409)).body.code,
    ).toBe('billing_bypassed');
  });

  it('limits coupon guesses per workspace, and a single-use coupon goes to one workspace', async () => {
    const guesser = await trial();
    for (let i = 0; i < 10; i++) {
      const res = await choose(guesser.token, { couponCode: `GUESS-${stamp}-${i}` }).expect(400);
      expect(res.body.code).toBe('coupon_invalid');
    }
    const blocked = await choose(guesser.token, { couponCode: `GUESS-${stamp}-x` }).expect(429);
    expect(blocked.body.code).toBe('too_many_attempts');

    // Two workspaces redeem the last use at the same moment: the row lock lets one through.
    const coupon = await newCoupon({ percentOff: 10, months: 1, maxRedemptions: 1 });
    const [a, b] = await Promise.all([trial(), trial()]);
    const results = await Promise.all([
      choose(a.token, { couponCode: coupon }),
      choose(b.token, { couponCode: coupon }),
    ]);
    expect(results.map((r) => r.status).toSorted()).toEqual([200, 400]);
    expect(results.find((r) => r.status === 400)!.body.code).toBe('coupon_used_up');
  });

  it('cancels at the end of the month, and choosing a plan again keeps it going', async () => {
    const { token } = await trial();
    await api(app).post('/tenant/billing/cancel').set(bearer(token)).expect(409);
    await choose(token).expect(200);
    await api(app).post('/tenant/billing/cancel').set(bearer(token)).expect(200);
    expect((await overview(token)).subscription?.cancelAt).toBe(lastDay(monthOf(today)));
    expect((await access(token)).access.accessState).toBe('full');
    await choose(token).expect(200);
    expect((await overview(token)).subscription?.cancelAt).toBeNull();
  });

  it('invoices each month in arrears: a part first month, the minimum, the coupon, then VAT', async () => {
    expect((await issue(monthOf(today)).expect(400)).body.code).toBe('month_not_over');
    const coupon = await newCoupon({ percentOff: 20, months: 1 });
    const { id, token, first, second, invoices: mine, issued } = await invoicedWorkspace(coupon);
    expect(issued).toBeGreaterThan(0);
    // Issuing again keeps what was issued and counts nothing new.
    expect((await issue(lastMonth).expect(200)).body.issued).toBe(0);
    expect(mine).toHaveLength(2);
    expect(first.number).toMatch(/^GP\/\d{4}-\d{2}\/\d{6}$/);
    expect(first.periodStart).toBe(`${monthBefore}-01`);

    // No one employed: the minimum, for the days from the 16th.
    const days = Number(lastDay(monthBefore).slice(8));
    const part = round2((5000 * (days - 15)) / days);
    const discount = round2(Number(part) * 0.2);
    const taxable = round2(Number(part) - Number(discount));
    expect(first.lines).toEqual([
      expect.objectContaining({
        description: `Business: minimum monthly charge (${days - 15} of ${days} days)`,
        amount: part,
      }),
    ]);
    expect(first).toMatchObject({
      subtotal: part,
      discount,
      taxable,
      serviceCode: 'S099.10',
      vatRate: '5.00',
      vat: round2(Number(taxable) * 0.05),
      status: 'open',
      buyer: { name: 'Meghna Knit Composite Ltd', bin: '004512369-0101' },
    });
    // The coupon was for one month.
    expect(second).toMatchObject({
      subtotal: '5000.00',
      discount: '0.00',
      vat: '250.00',
      total: '5250.00',
    });
    expect((await overview(token)).coupon).toBeNull();
    expect(await sent(id, `billing.invoice_issued:${first.id}`)).not.toHaveLength(0);

    for (const language of ['en', 'bn']) {
      const pdf = await binary(
        api(app)
          .get(`/tenant/billing/invoices/${first.id}/pdf?language=${language}`)
          .set(bearer(token)),
      ).expect(200);
      expect(isPdf(pdf.body as Buffer)).toBe(true);
    }
    // Another workspace cannot see it.
    const group = (await tenantLogin(app, 'my-group')).accessToken;
    await api(app).get(`/tenant/billing/invoices/${first.id}`).set(bearer(group)).expect(404);
  });

  it('counts a seat for everyone employed in the month, workers at the worker price', async () => {
    const [group] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    const from = `${lastMonth}-01`;
    const to = lastDay(lastMonth);
    const seats = await seatsOf(db, group!.id, from, to);
    const employed = await runAsTenant(db, group!.id, (tx) =>
      tx
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            lte(employees.joinedOn, to),
            or(isNull(employees.separatedOn), gte(employees.separatedOn, from)),
          ),
        ),
    );
    expect(seats.staff + seats.workers).toBe(employed.length);
    expect(seats.staff).toBeGreaterThan(0);
    expect(seats.workers).toBeGreaterThan(0);
  });

  it('makes an overdue workspace read-only, and paying online restores it at once', async () => {
    const { id, token, first, second } = await invoicedWorkspace();
    await db
      .update(invoices)
      .set({ dueDate: addDays(today, -20) })
      .where(eq(invoices.id, first.id));
    await jobs.runDaily();
    const locked = await access(token);
    expect(locked.access).toMatchObject({ accessState: 'read_only', reason: 'payment_overdue' });
    expect(
      (await api(app).post('/tenant/legal-entities').set(bearer(token)).send({ name: 'New Ltd' }))
        .body.code,
    ).toBe('tenant_read_only');
    expect(await sent(id, `billing.payment_due:${first.id}:read_only`)).not.toHaveLength(0);

    // Paying is open while read-only. The test gateway sends the browser straight back.
    const { redirectUrl } = (
      await api(app)
        .post(`/tenant/billing/invoices/${first.id}/pay`)
        .set(bearer(token))
        .send({ method: 'fake' })
        .expect(200)
    ).body as { redirectUrl: string };
    const back = new URL(redirectUrl);
    expect(back.pathname).toMatch(/^\/billing\/return\/fake\/[0-9a-f-]{36}$/);
    const returned = await api(app).get(`${back.pathname}${back.search}`).expect(303);
    const web = new URL(returned.headers.location!);
    expect(web.pathname).toBe('/workspace/billing');
    expect(web.searchParams.get('paid')).toBe(first.number);
    // Coming back again records nothing twice.
    await api(app).get(`${back.pathname}${back.search}`).expect(303);
    const paid = await invoiceOf(first.id);
    expect(paid).toMatchObject({ status: 'paid', balance: '0.00' });
    expect(paid.settlements.filter((s) => s.status === 'succeeded')).toHaveLength(1);
    expect(await sent(id, 'billing.payment_received:')).toHaveLength(1);

    expect((await access(token)).access.accessState).toBe('full');
    await api(app)
      .post(`/tenant/billing/invoices/${first.id}/pay`)
      .set(bearer(token))
      .send({ method: 'fake' })
      .expect(409);

    // A return the gateway does not confirm is a failed payment, whatever the browser says.
    const { redirectUrl: again } = (
      await api(app)
        .post(`/tenant/billing/invoices/${second.id}/pay`)
        .set(bearer(token))
        .send({ method: 'fake' })
        .expect(200)
    ).body as { redirectUrl: string };
    const forged = new URL(again);
    forged.searchParams.set('ref', first.id);
    const refused = await api(app).get(`${forged.pathname}${forged.search}`).expect(303);
    expect(new URL(refused.headers.location!).searchParams.get('failed')).toBe(second.number);
    expect((await invoiceOf(second.id)).balance).toBe('5250.00');
    // SSLCommerz and bKash are not configured here.
    await api(app)
      .post(`/tenant/billing/invoices/${second.id}/pay`)
      .set(bearer(token))
      .send({ method: 'bkash' })
      .expect(400);
  });

  it('counts tax withheld at source at once, within its limits, until finance rejects it', async () => {
    const { token, second } = await invoicedWorkspace();
    const deduct = (body: Record<string, unknown>) =>
      api(app)
        .post(`/tenant/billing/invoices/${second.id}/deductions`)
        .set(bearer(token))
        .send({ certificateDate: today, ...body });
    // VDS at 5% of 5,000, TDS at 10%.
    expect(
      (await deduct({ kind: 'vds', amount: '300', certificateNo: 'M66-1' }).expect(400)).body.code,
    ).toBe('deduction_too_large');
    await deduct({ kind: 'vds', amount: '250', certificateNo: 'M66-1' }).expect(201);
    const withheld = (
      await deduct({ kind: 'tds', amount: '500', certificateNo: 'TDS-9' }).expect(201)
    ).body as InvoiceView;
    expect(withheld.balance).toBe('4500.00');

    const review = (kind: string, accept: boolean) => {
      const s = withheld.settlements.find((x) => x.kind === kind)!;
      return api(app)
        .post(`/platform/billing/settlements/${s.id}/review`)
        .set(bearer(platform))
        .send({ accept, reason: accept ? 'Certificate checked' : 'No certificate received' });
    };
    await review('vds', true).expect(200);
    const rejected = (await review('tds', false).expect(200)).body as InvoiceView;
    expect(rejected.balance).toBe('5000.00');
    await review('tds', true).expect(409);
  });

  it('credits an invoice with a Mushak-6.7 credit note, never more than it charged', async () => {
    const { second } = await invoicedWorkspace();
    const credit = (amount: string) =>
      api(app)
        .post(`/platform/billing/invoices/${second.id}/credit-notes`)
        .set(bearer(platform))
        .send({ amount, reason: 'Two people left in the first week' });
    expect((await credit('5000.01').expect(400)).body.code).toBe('credit_too_large');
    const note = (await credit('1000').expect(201)).body as InvoiceView;
    expect(note).toMatchObject({
      kind: 'credit_note',
      status: 'paid',
      taxable: '1000.00',
      vat: '50.00',
      total: '1050.00',
      credits: { id: second.id, number: second.number },
    });
    expect(note.number).toMatch(/^GP-CN\/\d{4}-\d{2}\/\d{6}$/);
    expect((await invoiceOf(second.id)).balance).toBe('4200.00');
    expect((await credit('4000.01').expect(400)).body.code).toBe('credit_too_large');
    const pdf = await binary(
      api(app).get(`/platform/billing/invoices/${note.id}/pdf?language=bn`).set(bearer(platform)),
    ).expect(200);
    expect(isPdf(pdf.body as Buffer)).toBe(true);
  });

  it('records cheques and bank transfers, and matches a statement by invoice number once', async () => {
    const { second } = await invoicedWorkspace();
    const pay = (amount: string) =>
      api(app)
        .post(`/platform/billing/invoices/${second.id}/payments`)
        .set(bearer(platform))
        .send({ method: 'cheque', amount, reference: 'DBBL-445120', receivedOn: today });
    expect((await pay('6000').expect(400)).body.code).toBe('more_than_owed');
    expect(((await pay('3250').expect(201)).body as InvoiceView).balance).toBe('2000.00');

    const [, fy, serial] = /^GP\/(\d{4}-\d{2})\/(\d{6})$/.exec(second.number)!;
    const reference = `FT${serial}`;
    const csv = [
      'Bank statement,Sample Bank PLC',
      'Date,Narration,Ref No,Debit,Credit',
      `${today},BEFTN IN MEGHNA KNIT GP ${fy} ${serial},${reference},,"2,000.00"`,
      `${today},Office rent refund,FT2610-78,,1500.00`,
      `${today},Bank charge,,115.00,`,
    ].join('\n');
    const upload = () =>
      api(app)
        .post('/platform/billing/statements')
        .set(bearer(platform))
        .attach('file', Buffer.from(csv), 'statement.csv')
        .expect(200);
    const matched = (await upload()).body as StatementMatchView;
    expect(matched.recorded).toEqual([
      { invoiceNumber: second.number, amount: '2000.00', reference },
    ]);
    expect(matched.unmatched).toEqual([expect.objectContaining({ amount: '1500.00' })]);
    expect(((await upload()).body as StatementMatchView).recorded).toHaveLength(0);
    expect(await invoiceOf(second.id)).toMatchObject({ status: 'paid', balance: '0.00' });
  });

  it('bills a partner once a month for its workspaces, at its discount', async () => {
    const partner = (
      await api(app)
        .post('/platform/billing/partners')
        .set(bearer(platform))
        .send({
          name: `Dhaka HR Partners ${stamp}`,
          email: `billing-${stamp.toLowerCase()}@partner.test`,
          address: 'Banani, Dhaka 1213',
          discountPercent: 15,
        })
        .expect(201)
    ).body as PartnerView;
    const managed = await assign({ billingMode: 'complimentary', planCode: 'growth' });
    await api(app)
      .patch(`/platform/billing/tenants/${managed.id}/partner`)
      .set(bearer(platform))
      .send({ partnerId: partner.id, reason: 'Signed through the partner' })
      .expect(200);
    const view = await access(managed.token);
    expect(view.tenant.billingMode).toBe('partner');
    expect(view.access.accessState).toBe('full');

    await issue(lastMonth).expect(200);
    const [invoice] = (
      await api(app)
        .get(`/platform/billing/invoices?partnerId=${partner.id}`)
        .set(bearer(platform))
        .expect(200)
    ).body as InvoiceView[];
    // Growth's minimum of 3,000, 15% off, then VAT at 5%.
    expect(invoice).toMatchObject({
      partner: { id: partner.id },
      tenant: null,
      subtotal: '3000.00',
      discount: '450.00',
      taxable: '2550.00',
      vat: '127.50',
      total: '2677.50',
      buyer: { name: partner.name },
    });
    expect(invoice!.lines[0]!.description).toContain('(Growth): minimum monthly charge');
  });

  it('reminds a trial a week before, the day before and when it ends, each once', async () => {
    const ending = await assign({
      billingMode: 'trial',
      planCode: 'business',
      accessExpiresAt: new Date(Date.now() + 5 * DAY).toISOString(),
    });
    const key = `trial.ending:${ending.id}`;
    await jobs.runDaily();
    await jobs.runDaily();
    expect(await sent(ending.id, key)).toHaveLength(1);
    await jobs.runDaily(new Date(Date.now() + 4.5 * DAY));
    expect(await sent(ending.id, key)).toHaveLength(2);
    await jobs.runDaily(new Date(Date.now() + 6 * DAY));
    await jobs.runDaily(new Date(Date.now() + 6 * DAY));
    expect(await sent(ending.id, key)).toHaveLength(3);
  });

  it('keeps the console to platform staff, and the prices public', async () => {
    const group = (await tenantLogin(app, 'my-group')).accessToken;
    await api(app).get('/platform/billing/summary').set(bearer(group)).expect(403);
    const summary = (
      await api(app).get('/platform/billing/summary').set(bearer(platform)).expect(200)
    ).body;
    expect(summary).toMatchObject({ paidTenants: expect.any(Number) });
    const prices = (await api(app).get('/billing/prices').expect(200)).body as {
      planCode: string;
    }[];
    expect(prices.map((p) => p.planCode)).toEqual(
      expect.arrayContaining(['starter', 'growth', 'business']),
    );
  });
});
