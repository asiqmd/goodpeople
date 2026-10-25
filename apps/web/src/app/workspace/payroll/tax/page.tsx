import { can, todayIn, type TaxDeclarationView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { VerifyDeclarationForm } from '@/components/payroll/benefit-forms';
import { PayrollTabs, recentYears, taka } from '@/components/payroll/payroll-views';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function TaxPage({ searchParams }: PageProps<'/workspace/payroll/tax'>) {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'payroll.view')) redirect('/workspace');
  const canManage = can(role, 'payroll.manage');
  const t = await getTranslations('payroll');
  const tt = await getTranslations('payroll.tax');
  const format = await getFormatter();
  const years = recentYears(todayIn());
  const asked = (await searchParams).fiscalYear;
  const fiscalYear = years.includes(asked as string) ? (asked as string) : years[0]!;
  const declarations = await load<TaxDeclarationView[]>(
    'tenant',
    `/tenant/payroll/tax/declarations?fiscalYear=${fiscalYear}`,
  );
  const waiting = declarations.filter((d) => d.status === 'submitted');
  const verified = declarations.filter((d) => d.status === 'verified');

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PayrollTabs current="tax" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-2 text-sm">
          {years.map((y) => (
            <Link
              key={y}
              href={`/workspace/payroll/tax?fiscalYear=${y}`}
              aria-current={y === fiscalYear ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 font-medium ${
                y === fiscalYear ? 'bg-white shadow-sm ring-1 ring-slate-200' : 'text-slate-600'
              }`}
            >
              {tt('year', { year: y })}
            </Link>
          ))}
        </nav>
        <a
          href={`/workspace/files/tax-register?fiscalYear=${fiscalYear}`}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          {tt('register')}
        </a>
      </div>
      <p className="text-sm text-slate-600">{tt('intro')}</p>
      <Card title={tt('waiting', { count: waiting.length })}>
        {waiting.length === 0 ? (
          <p className="text-sm text-slate-500">{tt('noneWaiting')}</p>
        ) : (
          <ul className="-mx-5 divide-y divide-slate-100">
            {waiting.map((d) => (
              <li key={d.employee.id} className="space-y-2 px-5 py-3">
                <p className="text-sm">
                  <Link
                    href={`/workspace/employees/${d.employee.id}?tab=pay`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {d.employee.fullName}
                  </Link>{' '}
                  <span className="font-mono text-xs text-slate-400">
                    {d.employee.employeeCode}
                  </span>{' '}
                  · {tt('declared', { amount: taka(format, d.declared) })}
                </p>
                {canManage ? (
                  <VerifyDeclarationForm
                    employeeId={d.employee.id}
                    fiscalYear={fiscalYear}
                    items={d.items}
                  />
                ) : (
                  <ul className="text-sm text-slate-600">
                    {d.items.map((i, n) => (
                      <li key={n}>
                        {tt(`kinds.${i.kind}`)}: {taka(format, i.declared)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {verified.length > 0 && (
        <Card title={tt('verifiedTitle', { count: verified.length })}>
          <ul className="-mx-5 divide-y divide-slate-100 text-sm">
            {verified.map((d) => (
              <li
                key={d.employee.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-2"
              >
                <span>
                  {d.employee.fullName}{' '}
                  <span className="font-mono text-xs text-slate-400">
                    {d.employee.employeeCode}
                  </span>
                </span>
                <span className="flex items-center gap-3 tabular-nums">
                  {tt('acceptedOf', {
                    accepted: taka(format, d.verified ?? '0'),
                    declared: taka(format, d.declared),
                  })}
                  <Badge tone="green">{tt('statuses.verified')}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
