import { can, type BillingOverview, type InvoiceView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import {
  CancelPlanButton,
  ChoosePlanForm,
  DeductionForm,
  PayButtons,
} from '@/components/billing-forms';
import { Badge, Banner, BILLING_TONE, Card, type Tone } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
const taka = (format: Formatter, amount: string | number) =>
  `৳${format.number(Number(amount), { maximumFractionDigits: 2 })}`;
const dayOf = (format: Formatter, iso: string) =>
  format.dateTime(new Date(iso.length === 10 ? `${iso}T00:00:00+06:00` : iso), {
    dateStyle: 'medium',
    timeZone: 'Asia/Dhaka',
  });
const monthName = (format: Formatter, iso: string) =>
  format.dateTime(new Date(`${iso}T00:00:00+06:00`), {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  });
const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_TONE: Record<string, Tone> = {
  open: 'amber',
  overdue: 'red',
  paid: 'green',
  void: 'slate',
};

/** What is still withholdable on an invoice, after what was already recorded. */
function deductionLimits(invoice: InvoiceView, vdsRate: number) {
  const used = (kind: string) =>
    invoice.settlements
      .filter((s) => s.kind === kind && s.status !== 'rejected')
      .reduce((sum, s) => sum + Number(s.amount), 0);
  const taxable = Number(invoice.taxable);
  const rate = Math.min(vdsRate, Number(invoice.vatRate));
  return {
    vds: Math.max(0, (taxable * rate) / 100 - used('vds')).toFixed(2),
    tds: Math.max(0, taxable * 0.1 - used('tds')).toFixed(2),
  };
}

/** The workspace's plan, what it costs, its VAT invoices and how to pay them. */
export default async function BillingPage({ searchParams }: PageProps<'/workspace/billing'>) {
  const t = await getTranslations('billing');
  const tm = await getTranslations('billingModes');
  const tp = await getTranslations('pricing.plans');
  const format = await getFormatter();
  const user = await currentTenantUser();
  if (!can(user?.role, 'billing.manage')) {
    return <Banner tone="slate">{t('notAllowed')}</Banner>;
  }
  const overview = await load<BillingOverview>('tenant', '/tenant/billing');
  const query = await searchParams;
  const paidNumber = one(query.paid);
  const failedNumber = one(query.failed);
  const pending = one(query.pending);
  const billed = overview.billingMode === 'trial' || overview.billingMode === 'paid';
  const today = todayIso();
  const sub = overview.subscription;
  const invoices = overview.invoices.filter((i) => i.kind === 'invoice');
  const notes = overview.invoices.filter((i) => i.kind === 'credit_note');
  const statusOf = (i: InvoiceView) =>
    i.status === 'open' && i.dueDate && i.dueDate < today ? 'overdue' : i.status;

  return (
    <>
      {paidNumber !== undefined && (
        <Banner tone="green">{t('paid', { number: paidNumber })}</Banner>
      )}
      {failedNumber !== undefined && (
        <Banner tone="red">{t('failed', { number: failedNumber })}</Banner>
      )}
      {pending !== undefined && <Banner tone="amber">{t('pending')}</Banner>}

      <Card
        title={t('title')}
        action={
          overview.billingMode === 'paid' && sub && !sub.cancelAt ? <CancelPlanButton /> : null
        }
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">{t('mode')}</dt>
            <dd className="mt-1">
              <Badge tone={BILLING_TONE[overview.billingMode]}>{tm(overview.billingMode)}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('plan')}</dt>
            <dd className="mt-1 font-medium">{tp(overview.planCode)}</dd>
          </div>
          {overview.trialEndsAt && (
            <div>
              <dt className="text-slate-500">{t('trialEnds')}</dt>
              <dd className="mt-1">{dayOf(format, overview.trialEndsAt)}</dd>
            </div>
          )}
          {overview.billingMode === 'paid' && sub && (
            <>
              <div>
                <dt className="text-slate-500">{t('status')}</dt>
                <dd className="mt-1">
                  <Badge
                    tone={
                      sub.status === 'active'
                        ? 'green'
                        : sub.status === 'past_due'
                          ? 'red'
                          : 'slate'
                    }
                  >
                    {t(`statuses.${sub.status}`)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{sub.cancelAt ? t('endsOn') : t('paidThrough')}</dt>
                <dd className="mt-1">{dayOf(format, sub.cancelAt ?? sub.paidThrough)}</dd>
              </div>
            </>
          )}
          {overview.coupon && (
            <div>
              <dt className="text-slate-500">{t('couponApplied')}</dt>
              <dd className="mt-1">
                <span className="font-mono">{overview.coupon.code}</span>{' '}
                <span className="text-slate-500">({overview.coupon.describe})</span>
              </dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-sm text-slate-600">
          {t('seats', {
            staff: overview.seats.staff,
            workers: overview.seats.workers,
          })}
        </p>
        {!billed && <p className="mt-2 text-sm text-slate-600">{t('notBilled')}</p>}
      </Card>

      {billed && (
        <Card title={overview.billingMode === 'paid' ? t('changeTitle') : t('chooseTitle')}>
          <ChoosePlanForm overview={overview} />
        </Card>
      )}

      {overview.invoices.length > 0 && (
        <Card title={t('invoices')}>
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{t('number')}</th>
                  <th className="px-5 py-2 font-medium">{t('period')}</th>
                  <th className="px-5 py-2 font-medium">{t('due')}</th>
                  <th className="px-5 py-2 text-right font-medium">{t('total')}</th>
                  <th className="px-5 py-2 text-right font-medium">{t('balance')}</th>
                  <th className="px-5 py-2 font-medium">{t('statusHead')}</th>
                  <th className="px-5 py-2 font-medium">{t('download')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((i) => {
                  const status = statusOf(i);
                  return (
                    <tr key={i.id} className="align-top">
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs">{i.number}</td>
                      <td className="px-5 py-3">
                        {i.periodStart && monthName(format, i.periodStart)}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {i.dueDate && dayOf(format, i.dueDate)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{taka(format, i.total)}</td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums">
                        {taka(format, i.balance)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONE[status]!}>{t(`invoiceStatuses.${status}`)}</Badge>
                      </td>
                      <td className="space-x-2 px-5 py-3 whitespace-nowrap">
                        <a
                          href={`/workspace/files/invoice/${i.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {t('pdfEn')}
                        </a>
                        <a
                          href={`/workspace/files/invoice/${i.id}?language=bn`}
                          className="text-brand-700 hover:underline"
                        >
                          {t('pdfBn')}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {invoices
            .filter((i) => i.status === 'open' && Number(i.balance) > 0)
            .map((i) => (
              <div key={i.id} className="mt-4 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-sm font-medium">
                  {t('payTitle', { number: i.number, amount: taka(format, i.balance) })}
                </p>
                {overview.gateways.length > 0 ? (
                  <div className="mt-3">
                    <PayButtons invoiceId={i.id} gateways={overview.gateways} />
                    {Number(i.balance) > 100_000 && (
                      <p className="mt-2 text-xs text-slate-500">{t('bankRule')}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">{t('noGateways')}</p>
                )}
                {i.settlements.some((s) => s.kind !== 'payment') && (
                  <ul className="mt-3 space-y-1 text-xs text-slate-600">
                    {i.settlements
                      .filter((s) => s.kind !== 'payment')
                      .map((s) => (
                        <li key={s.id}>
                          {t(`deductionKinds.${s.kind}`)}: {taka(format, s.amount)} · {s.reference}{' '}
                          · {t(`deductionStatuses.${s.status}`)}
                        </li>
                      ))}
                  </ul>
                )}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-brand-700">
                    {t('withheld')}
                  </summary>
                  <div className="mt-3">
                    <DeductionForm
                      invoiceId={i.id}
                      limits={deductionLimits(i, Number(overview.vat.vdsRate))}
                    />
                  </div>
                </details>
              </div>
            ))}
          {notes.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">{t('creditNotes')}</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {notes.map((n) => (
                  <li key={n.id} className="flex flex-wrap gap-x-3">
                    <span className="font-mono text-xs">{n.number}</span>
                    <span>{t('credits', { number: n.credits?.number ?? '' })}</span>
                    <span className="tabular-nums">{taka(format, n.total)}</span>
                    <span className="text-slate-500">{n.reason}</span>
                    <a
                      href={`/workspace/files/invoice/${n.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {t('pdfEn')}
                    </a>
                    <a
                      href={`/workspace/files/invoice/${n.id}?language=bn`}
                      className="text-brand-700 hover:underline"
                    >
                      {t('pdfBn')}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {billed && (
        <div className="grid gap-6 md:grid-cols-2">
          {overview.bankDetails && (
            <Card title={t('bankTitle')}>
              <p className="whitespace-pre-line text-sm text-slate-700">{overview.bankDetails}</p>
              <p className="mt-3 text-xs text-slate-500">{t('bankNote')}</p>
            </Card>
          )}
          <Card title={t('vatTitle')}>
            <p className="text-sm text-slate-700">
              {overview.vat.exempt
                ? t('vatExempt')
                : t('vat', {
                    rate: format.number(Number(overview.vat.rate)),
                    code: overview.vat.serviceCode,
                  })}
            </p>
            {!overview.vat.exempt && (
              <p className="mt-2 text-sm text-slate-600">
                {t('vds', { rate: format.number(Number(overview.vat.vdsRate)) })}
              </p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
