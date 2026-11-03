import { can, MATERNITY_CASE_STATUSES, type MaternityCaseSummary } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { CaseStatusBadge, EligibleBadge, NextPart } from '@/components/maternity/maternity-views';
import { taka } from '@/components/payroll/payroll-views';
import { buttonClass, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const FILTERS = [...MATERNITY_CASE_STATUSES, 'all'] as const;

export default async function MaternityCasesPage({
  searchParams,
}: PageProps<'/workspace/leave/maternity'>) {
  if (!can((await currentTenantUser())?.role, 'leave.manage')) redirect('/workspace');
  const t = await getTranslations('maternity');
  const format = await getFormatter();
  const locale = await getLocale();
  const requested = (await searchParams).status;
  const filter = FILTERS.find((f) => f === requested) ?? 'open';
  const cases = await load<MaternityCaseSummary[]>(
    'tenant',
    `/tenant/maternity/cases${filter === 'all' ? '' : `?status=${filter}`}`,
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link href="/workspace/leave/maternity/new" className={buttonClass.primary}>
          {t('newCase')}
        </Link>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">{t('intro')}</p>
      <Card
        title={t('cases')}
        action={
          <nav className="flex gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={`/workspace/leave/maternity?status=${f}`}
                aria-current={f === filter ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1 text-sm ${f === filter ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {t(`filters.${f}`)}
              </Link>
            ))}
          </nav>
        }
      >
        {cases.length === 0 ? (
          <p className="text-sm text-slate-500">{t('none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{t('columns.person')}</th>
                  <th className="px-5 py-2 font-medium">{t('columns.expected')}</th>
                  <th className="px-5 py-2 font-medium">{t('columns.option')}</th>
                  <th className="px-5 py-2 font-medium">{t('columns.status')}</th>
                  <th className="px-5 py-2 font-medium">{t('columns.next')}</th>
                  <th className="px-5 py-2 text-end font-medium">{t('columns.total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/workspace/leave/maternity/${c.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {locale === 'bn' && c.employee.fullNameBn
                          ? c.employee.fullNameBn
                          : c.employee.fullName}
                      </Link>{' '}
                      <span className="font-mono text-xs text-slate-400">
                        {c.employee.employeeCode}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-700">
                      {day(format, c.expectedDeliveryOn)}
                      {c.deliveredOn && (
                        <span className="block text-xs text-slate-500">
                          {t('deliveredOn', { date: day(format, c.deliveredOn) })}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-slate-700">
                      {t(`options.${c.paymentOption}.title`)}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="flex flex-wrap gap-1.5">
                        <CaseStatusBadge status={c.status} />
                        <EligibleBadge eligible={c.eligible} />
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-700">
                      <NextPart next={c.next} />
                    </td>
                    <td className="px-5 py-2.5 text-end tabular-nums">
                      {c.total ? taka(format, c.total) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
