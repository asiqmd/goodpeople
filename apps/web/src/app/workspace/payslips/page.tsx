import {
  todayIn,
  type LoanView,
  type PayslipSummary,
  type PfStatement,
  type TaxYearView,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { HelpLink } from '@/components/help/help-link';
import { day } from '@/components/leave/leave-views';
import { DeclarationForm } from '@/components/payroll/benefit-forms';
import {
  FundStatement,
  monthName,
  recentYears,
  runPeriod,
  taka,
  TaxYear,
} from '@/components/payroll/payroll-views';
import { Badge, Card } from '@/components/ui';
import { authedFetch, load } from '@/lib/api';

const TABS = ['payslips', 'tax', 'pf', 'loans'] as const;
type Tab = (typeof TABS)[number];

/** The signed-in employee's own pay: payslips, salary tax, provident fund and loans. */
export default async function MyPayPage({ searchParams }: PageProps<'/workspace/payslips'>) {
  const t = await getTranslations('payroll.myPay');
  const query = await searchParams;
  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'payslips';
  return (
    <>
      <h1 className="text-2xl font-semibold">
        {t('title')}
        <HelpLink slug="payslips" />
      </h1>
      <nav className="flex flex-wrap gap-2 text-sm">
        {TABS.map((key) => (
          <Link
            key={key}
            href={`/workspace/payslips?tab=${key}`}
            aria-current={tab === key ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              tab === key
                ? 'bg-white shadow-sm ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t(`tabs.${key}`)}
          </Link>
        ))}
      </nav>
      {tab === 'payslips' && <Payslips />}
      {tab === 'tax' && <MyTax asked={query.fiscalYear} />}
      {tab === 'pf' && <MyFund />}
      {tab === 'loans' && <MyLoans />}
    </>
  );
}

async function Payslips() {
  const payslips = await load<PayslipSummary[]>('tenant', '/tenant/me/payslips');
  const t = await getTranslations('payroll.payslips');
  const format = await getFormatter();
  const locale = await getLocale();
  // The reader's language first.
  const languages = locale === 'bn' ? (['bn', 'en'] as const) : (['en', 'bn'] as const);
  if (payslips.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">{t('none')}</p>
      </Card>
    );
  }
  return (
    <Card>
      <ul className="-mx-5 -my-2 divide-y divide-slate-100">
        {payslips.map((p) => (
          <li
            key={p.itemId}
            className="flex flex-wrap items-center justify-between gap-4 px-5 py-3"
          >
            <div className="space-y-0.5">
              <p className="flex items-center gap-2 font-medium text-slate-900">
                {p.festival
                  ? locale === 'bn' && p.festivalBn
                    ? p.festivalBn
                    : p.festival
                  : runPeriod(format, p.periodStart, p.periodEnd)}
                {p.kind !== 'regular' && <Badge tone="violet">{t(`kinds.${p.kind}`)}</Badge>}
              </p>
              <p className="text-sm text-slate-500">
                {t('paidOn', { date: day(format, p.paymentDate) })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <span className="text-right">
                <span className="block text-xs text-slate-500">{t('net')}</span>
                <span className="text-lg font-semibold tabular-nums">{taka(format, p.net)}</span>
              </span>
              <span className="flex gap-3 text-sm">
                {languages.map((language) => (
                  <a
                    key={language}
                    href={`/workspace/files/payslips/${p.itemId}?language=${language}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t(`open.${language}`)}
                  </a>
                ))}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function MyTax({ asked }: { asked: string | string[] | undefined }) {
  const t = await getTranslations('payroll.tax');
  const format = await getFormatter();
  const years = recentYears(todayIn());
  const fiscalYear = years.includes(asked as string) ? (asked as string) : years[0]!;
  const result = await authedFetch<TaxYearView>(
    'tenant',
    `/tenant/me/tax?fiscalYear=${fiscalYear}`,
  );
  if (!result.ok) {
    return (
      <Card>
        <p className="text-sm text-slate-500">{t('noEmployee')}</p>
      </Card>
    );
  }
  const year = result.data;
  const declaration = year.declaration;
  return (
    <>
      <nav className="flex gap-2 text-sm">
        {years.map((y) => (
          <Link
            key={y}
            href={`/workspace/payslips?tab=tax&fiscalYear=${y}`}
            aria-current={y === fiscalYear ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              y === fiscalYear ? 'bg-white shadow-sm ring-1 ring-slate-200' : 'text-slate-600'
            }`}
          >
            {t('year', { year: y })}
          </Link>
        ))}
      </nav>
      <Card title={t('yearTitle', { year: fiscalYear })}>
        <TaxYear year={year} certificate="/workspace/files/my-tax-certificate" />
      </Card>
      <Card
        title={t('declaration.title')}
        action={
          declaration.status && (
            <Badge tone={declaration.status === 'verified' ? 'green' : 'amber'}>
              {t(`statuses.${declaration.status}`)}
            </Badge>
          )
        }
      >
        <p className="mb-4 text-sm text-slate-600">{t('declaration.intro')}</p>
        {declaration.status === 'verified' ? (
          <ul className="space-y-1 text-sm">
            {declaration.items.map((i, n) => (
              <li key={n} className="flex max-w-md justify-between gap-3">
                <span>{t(`kinds.${i.kind}`)}</span>
                <span className="tabular-nums">
                  {t('declaration.acceptedOf', {
                    accepted: taka(format, i.verified ?? '0'),
                    declared: taka(format, i.declared),
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <DeclarationForm
            employeeId={null}
            fiscalYear={fiscalYear}
            items={declaration.items}
            locked={false}
          />
        )}
      </Card>
    </>
  );
}

async function MyFund() {
  const t = await getTranslations('payroll.pf');
  // Non-members get an empty answer, which reads as an empty object.
  const result = await authedFetch<PfStatement | null>('tenant', '/tenant/me/pf');
  if (!result.ok || !result.data || !('balance' in result.data)) {
    return (
      <Card>
        <p className="text-sm text-slate-500">{t('notMember')}</p>
      </Card>
    );
  }
  return <FundStatement statement={result.data} />;
}

async function MyLoans() {
  const t = await getTranslations('payroll.loans');
  const format = await getFormatter();
  const loans = await load<LoanView[]>('tenant', '/tenant/me/loans');
  if (loans.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">{t('noneMine')}</p>
      </Card>
    );
  }
  return (
    <Card>
      <ul className="-mx-5 -my-2 divide-y divide-slate-100 text-sm">
        {loans.map((loan) => (
          <li key={loan.id} className="space-y-1 px-5 py-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t(`kinds.${loan.kind}`)}</span>
              <span className="tabular-nums">{taka(format, loan.principal)}</span>
              <Badge
                tone={
                  loan.status === 'active' ? 'blue' : loan.status === 'closed' ? 'green' : 'slate'
                }
              >
                {t(`statuses.${loan.status}`)}
              </Badge>
            </p>
            <p className="text-slate-600">
              {t('perMonth', { amount: taka(format, loan.installment) })} ·{' '}
              {t('from', { month: monthName(format, loan.startMonth) })} ·{' '}
              {t('left', { amount: taka(format, loan.outstanding) })}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
