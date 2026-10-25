import type {
  BillingSettingsView,
  BillingSummary,
  CouponView,
  InvoiceView,
  PartnerView,
  PlanPriceView,
  TenantWithAccess,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Fragment } from 'react';
import {
  AssignPartnerForm,
  BillingSettingsForm,
  CouponForm,
  CreditNoteForm,
  IssueInvoicesForm,
  PartnerForm,
  PaymentForm,
  PriceForm,
  ReviewDeductionForm,
  StatementForm,
} from '@/components/billing-forms';
import { Badge, Banner, Card, type Tone } from '@/components/ui';
import { load } from '@/lib/api';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
const taka = (format: Formatter, amount: string | number) =>
  `৳${format.number(Number(amount), { maximumFractionDigits: 2 })}`;
const dayOf = (format: Formatter, iso: string) =>
  format.dateTime(new Date(iso.length === 10 ? `${iso}T00:00:00+06:00` : iso), {
    dateStyle: 'medium',
    timeZone: 'Asia/Dhaka',
  });
const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const lastMonth = () => {
  const [y, m] = todayIso().split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};

const TABS = ['invoices', 'prices', 'coupons', 'partners', 'settings'] as const;
type Tab = (typeof TABS)[number];
const STATUS_TONE: Record<string, Tone> = {
  open: 'amber',
  overdue: 'red',
  paid: 'green',
  void: 'slate',
};
const head = 'px-5 py-2 font-medium';
const cell = 'px-5 py-2.5';

/** Good People's own billing: invoices and what settled them, prices, coupons, partners. */
export default async function PlatformBillingPage({
  searchParams,
}: PageProps<'/platform/billing'>) {
  const t = await getTranslations('platform.billing');
  const query = await searchParams;
  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'invoices';
  const summary = await load<BillingSummary>('platform', '/platform/billing/summary');
  const format = await getFormatter();
  const tiles: [string, string][] = [
    [t('summary.outstanding'), taka(format, summary.outstanding)],
    [t('summary.open'), format.number(summary.open)],
    [t('summary.overdue'), format.number(summary.overdue)],
    [t('summary.lastMonth'), taka(format, summary.lastMonth)],
    [t('summary.paid'), format.number(summary.paidTenants)],
    [t('summary.trials'), format.number(summary.trialTenants)],
  ];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <nav className="flex gap-1 border-b border-slate-200 text-sm font-medium">
        {TABS.map((x) => (
          <Link
            key={x}
            href={`/platform/billing?tab=${x}`}
            aria-current={x === tab ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 ${
              x === tab
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t(`tabs.${x}`)}
          </Link>
        ))}
      </nav>
      {tab === 'invoices' && (
        <Invoices status={typeof query.status === 'string' ? query.status : undefined} />
      )}
      {tab === 'prices' && <Prices />}
      {tab === 'coupons' && <Coupons />}
      {tab === 'partners' && <Partners />}
      {tab === 'settings' && <Settings />}
    </>
  );
}

async function Invoices({ status }: { status?: string }) {
  const t = await getTranslations('platform.billing.invoices');
  const ti = await getTranslations('billing');
  const format = await getFormatter();
  const filter = status === 'open' || status === 'paid' ? status : undefined;
  const invoices = await load<InvoiceView[]>(
    'platform',
    `/platform/billing/invoices${filter ? `?status=${filter}` : ''}`,
  );
  const today = todayIso();
  const statusOf = (i: InvoiceView) =>
    i.kind === 'invoice' && i.status === 'open' && i.dueDate && i.dueDate < today
      ? 'overdue'
      : i.status;
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t('issueTitle')}>
          <p className="mb-3 text-sm text-slate-600">{t('issueHint')}</p>
          <IssueInvoicesForm month={lastMonth()} />
        </Card>
        <Card title={t('statementTitle')}>
          <StatementForm />
        </Card>
      </div>
      <Card
        title={t('title')}
        action={
          <div className="flex gap-3 text-sm">
            {[undefined, 'open', 'paid'].map((s) => (
              <Link
                key={s ?? 'all'}
                href={`/platform/billing?tab=invoices${s ? `&status=${s}` : ''}`}
                className={
                  s === filter
                    ? 'font-semibold text-brand-700'
                    : 'text-slate-600 hover:text-slate-900'
                }
              >
                {t(`filter.${s ?? 'all'}`)}
              </Link>
            ))}
          </div>
        }
      >
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500">{t('none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className={head}>{ti('number')}</th>
                  <th className={head}>{t('to')}</th>
                  <th className={head}>{ti('period')}</th>
                  <th className={`${head} text-right`}>{ti('total')}</th>
                  <th className={`${head} text-right`}>{ti('balance')}</th>
                  <th className={head}>{ti('statusHead')}</th>
                  <th className={head}>{ti('download')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((i) => {
                  const pending = i.settlements.filter(
                    (s) => s.kind !== 'payment' && s.status === 'pending',
                  );
                  const st = statusOf(i);
                  return (
                    <Fragment key={i.id}>
                      <tr className="align-top">
                        <td className={`${cell} whitespace-nowrap font-mono text-xs`}>
                          {i.number}
                          {i.kind === 'credit_note' && (
                            <span className="mt-1 block font-sans text-slate-500">
                              {ti('credits', { number: i.credits?.number ?? '' })}
                            </span>
                          )}
                        </td>
                        <td className={cell}>
                          {i.tenant ? (
                            <Link
                              href={`/platform/tenants/${i.tenant.id}`}
                              className="hover:underline"
                            >
                              {i.tenant.name}
                            </Link>
                          ) : (
                            (i.partner?.name ?? i.buyer.name)
                          )}
                          {i.partner && <Badge tone="violet">{t('partner')}</Badge>}
                        </td>
                        <td className={cell}>
                          {i.periodStart &&
                            format.dateTime(new Date(`${i.periodStart}T00:00:00+06:00`), {
                              month: 'long',
                              year: 'numeric',
                              timeZone: 'Asia/Dhaka',
                            })}
                          {i.dueDate && (
                            <span className="block text-xs text-slate-500">
                              {t('dueOn', { date: dayOf(format, i.dueDate) })}
                            </span>
                          )}
                        </td>
                        <td className={`${cell} text-right tabular-nums`}>
                          {taka(format, i.total)}
                        </td>
                        <td className={`${cell} text-right tabular-nums`}>
                          {i.kind === 'invoice' ? taka(format, i.balance) : '—'}
                        </td>
                        <td className={cell}>
                          <Badge tone={STATUS_TONE[st]!}>{ti(`invoiceStatuses.${st}`)}</Badge>
                          {pending.length > 0 && (
                            <span className="mt-1 block text-xs text-amber-700">
                              {t('pendingDeductions', { count: pending.length })}
                            </span>
                          )}
                        </td>
                        <td className={`${cell} whitespace-nowrap`}>
                          <a
                            href={`/platform/files/invoice/${i.id}`}
                            className="text-brand-700 hover:underline"
                          >
                            {ti('pdfEn')}
                          </a>{' '}
                          <a
                            href={`/platform/files/invoice/${i.id}?language=bn`}
                            className="text-brand-700 hover:underline"
                          >
                            {ti('pdfBn')}
                          </a>
                        </td>
                      </tr>
                      {i.kind === 'invoice' && i.status !== 'void' && (
                        <tr>
                          <td colSpan={7} className="px-5 pb-3">
                            <details>
                              <summary className="cursor-pointer text-brand-700">
                                {t('manage')}
                              </summary>
                              <div className="mt-3 grid gap-4 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 lg:grid-cols-2">
                                {i.settlements.length > 0 && (
                                  <ul className="space-y-1 text-xs text-slate-600">
                                    {i.settlements.map((s) => (
                                      <li key={s.id}>
                                        {s.kind === 'payment'
                                          ? ti(`methodNames.${s.method ?? 'bank_transfer'}`)
                                          : ti(`deductionKinds.${s.kind}`)}
                                        : {taka(format, s.amount)} · {s.reference ?? '—'} ·{' '}
                                        {ti(
                                          `${s.kind === 'payment' ? 'paymentStatuses' : 'deductionStatuses'}.${s.status}`,
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {pending.map((s) => (
                                  <div key={s.id}>
                                    <p className="mb-1 text-xs font-medium">
                                      {ti(`deductionKinds.${s.kind}`)} {taka(format, s.amount)} (
                                      {s.reference})
                                    </p>
                                    <ReviewDeductionForm settlementId={s.id} />
                                  </div>
                                ))}
                                {i.status === 'open' && Number(i.balance) > 0 && (
                                  <div>
                                    <p className="mb-1 text-xs font-medium">{t('recordPayment')}</p>
                                    <PaymentForm invoiceId={i.id} />
                                  </div>
                                )}
                                <div>
                                  <p className="mb-1 text-xs font-medium">{t('creditNote')}</p>
                                  <CreditNoteForm invoiceId={i.id} />
                                </div>
                              </div>
                            </details>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

async function Prices() {
  const t = await getTranslations('platform.billing.prices');
  const tp = await getTranslations('pricing.plans');
  const format = await getFormatter();
  const prices = await load<PlanPriceView[]>('platform', '/platform/billing/prices');
  return (
    <Card title={t('title')}>
      <p className="mb-4 text-sm text-slate-600">{t('hint')}</p>
      <div className="-mx-5 mb-6 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className={head}>{t('plan')}</th>
              <th className={`${head} text-right`}>{t('staffSeat')}</th>
              <th className={`${head} text-right`}>{t('workerSeat')}</th>
              <th className={`${head} text-right`}>{t('minimum')}</th>
              <th className={head}>{t('from')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {prices.map((p) => (
              <tr key={p.id}>
                <td className={cell}>{tp(p.planCode)}</td>
                <td className={`${cell} text-right tabular-nums`}>{taka(format, p.staffSeat)}</td>
                <td className={`${cell} text-right tabular-nums`}>{taka(format, p.workerSeat)}</td>
                <td className={`${cell} text-right tabular-nums`}>{taka(format, p.minimum)}</td>
                <td className={cell}>{dayOf(format, p.effectiveFrom)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PriceForm />
    </Card>
  );
}

async function Coupons() {
  const t = await getTranslations('platform.billing.coupons');
  const format = await getFormatter();
  const coupons = await load<CouponView[]>('platform', '/platform/billing/coupons');
  return (
    <Card title={t('title')}>
      {coupons.length > 0 && (
        <div className="-mx-5 mb-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className={head}>{t('code')}</th>
                <th className={head}>{t('off')}</th>
                <th className={head}>{t('months')}</th>
                <th className={head}>{t('used')}</th>
                <th className={head}>{t('validUntil')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td className={`${cell} font-mono`}>{c.code}</td>
                  <td className={cell}>
                    {c.percentOff
                      ? `${format.number(Number(c.percentOff))}%`
                      : taka(format, c.amountOff ?? 0)}
                  </td>
                  <td className={cell}>
                    {c.months === null ? t('everyMonth') : format.number(c.months)}
                  </td>
                  <td className={cell}>
                    {format.number(c.redemptions)}
                    {c.maxRedemptions !== null && ` / ${format.number(c.maxRedemptions)}`}
                  </td>
                  <td className={cell}>{c.validUntil ? dayOf(format, c.validUntil) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CouponForm />
    </Card>
  );
}

async function Partners() {
  const t = await getTranslations('platform.billing.partners');
  const format = await getFormatter();
  const [partners, tenants] = await Promise.all([
    load<PartnerView[]>('platform', '/platform/billing/partners'),
    load<TenantWithAccess[]>('platform', '/platform/tenants'),
  ]);
  return (
    <>
      <Card title={t('title')}>
        <p className="mb-4 text-sm text-slate-600">{t('hint')}</p>
        {partners.length > 0 && (
          <div className="-mx-5 mb-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className={head}>{t('name')}</th>
                  <th className={head}>{t('discount')}</th>
                  <th className={head}>{t('workspaces')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partners.map((p) => (
                  <tr key={p.id}>
                    <td className={cell}>
                      {p.name}
                      <span className="block text-xs text-slate-500">{p.email}</span>
                    </td>
                    <td className={cell}>{format.number(Number(p.discountPercent))}%</td>
                    <td className={cell}>
                      {p.tenants.length === 0
                        ? '—'
                        : p.tenants.map((x) => (
                            <Link
                              key={x.id}
                              href={`/platform/tenants/${x.id}`}
                              className="mr-2 font-mono text-xs text-brand-700 hover:underline"
                            >
                              {x.slug}
                            </Link>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PartnerForm />
      </Card>
      {partners.length > 0 && (
        <Card title={t('assignTitle')}>
          <p className="mb-3 text-sm text-slate-600">{t('assignHint')}</p>
          <AssignPartnerForm
            partners={partners}
            tenants={tenants.map((x) => ({ id: x.id, name: x.name, slug: x.slug }))}
          />
        </Card>
      )}
    </>
  );
}

async function Settings() {
  const t = await getTranslations('platform.billing.settings');
  // No settings yet comes back as an empty body.
  const saved = await load<BillingSettingsView | null>('platform', '/platform/billing/settings');
  const settings = saved && 'bin' in saved ? saved : null;
  return (
    <Card title={t('title')}>
      {!settings && (
        <div className="mb-4">
          <Banner tone="amber">{t('notSet')}</Banner>
        </div>
      )}
      <BillingSettingsForm settings={settings} />
    </Card>
  );
}
