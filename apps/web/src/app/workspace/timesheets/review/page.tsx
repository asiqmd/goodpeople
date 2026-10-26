import { can, todayIn, type TimesheetListView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { hours, STATUS_TONE } from '@/components/timesheets/labels';
import { ReopenTimesheetForm } from '@/components/timesheets/timesheet-forms';
import { monthTitle } from '@/components/timesheets/timesheet-views';
import { Badge, Card } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';
import { MONTH, shiftMonth } from '@/lib/month';

/** Everyone's timesheets for a month, for those who manage projects. */
export default async function TimesheetReviewPage({
  searchParams,
}: PageProps<'/workspace/timesheets/review'>) {
  const t = await getTranslations('timesheets');
  const format = await getFormatter();
  const locale = await getLocale();
  if (!can((await currentTenantUser())?.role, 'projects.manage')) {
    return (
      <Card title={t('review.title')}>
        <p className="text-sm text-slate-600">{t('review.notAllowed')}</p>
      </Card>
    );
  }
  const sp = await searchParams;
  const thisMonth = todayIn().slice(0, 7);
  const month =
    typeof sp.month === 'string' && MONTH.test(sp.month) && sp.month <= thisMonth
      ? sp.month
      : shiftMonth(thisMonth, -1);
  const result = await authedFetch<TimesheetListView>(
    'tenant',
    `/tenant/timesheets?month=${month}`,
  );
  if (!result.ok) {
    return (
      <Card title={t('review.title')}>
        <p className="text-sm text-slate-600">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </p>
      </Card>
    );
  }
  const list = result.data;
  const count = (status: string | null) => list.rows.filter((r) => r.status === status).length;
  const missing = list.rows.filter(
    (r) => r.needed && (r.status === null || r.status === 'draft' || r.status === 'rejected'),
  ).length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t('review.title')}</h1>
        <Link
          href={`/workspace/timesheets?month=${month}`}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          {t('review.mine')} →
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{monthTitle(format, month)}</h2>
        <div className="flex gap-3 text-sm">
          <Link
            href={`/workspace/timesheets/review?month=${shiftMonth(month, -1)}`}
            className="text-slate-600 hover:text-slate-900"
          >
            ← {t('previous')}
          </Link>
          {month < thisMonth && (
            <Link
              href={`/workspace/timesheets/review?month=${shiftMonth(month, 1)}`}
              className="text-slate-600 hover:text-slate-900"
            >
              {t('next')} →
            </Link>
          )}
        </div>
      </div>
      <p className="text-sm text-slate-600">
        {t('review.counts', {
          people: list.rows.length,
          approved: count('approved'),
          submitted: count('submitted'),
          missing,
        })}
      </p>

      <Card>
        {list.rows.length === 0 ? (
          <p className="text-sm text-slate-500">{t('review.none')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t('review.person')}</th>
                  <th className="py-2 pr-3 font-medium">{t('review.status')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('review.hours')}</th>
                  {list.projects.map((p) => (
                    <th key={p.id} className="py-2 pr-3 text-right font-medium">
                      <span className="font-mono">{p.code}</span>
                      <span className="block font-normal">
                        {locale === 'bn' && p.nameBn ? p.nameBn : p.name}
                      </span>
                    </th>
                  ))}
                  <th className="py-2 pr-3 text-right font-medium">{t('grid.uncharged')}</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.rows.map((row) => {
                  const uncharged = row.totals.find((x) => x.project === null);
                  return (
                    <tr key={row.employee.id} className="align-top">
                      <td className="py-2 pr-3">
                        <span className="font-medium">
                          {locale === 'bn' && row.employee.fullNameBn
                            ? row.employee.fullNameBn
                            : row.employee.fullName}
                        </span>{' '}
                        <span className="font-mono text-xs text-slate-400">
                          {row.employee.employeeCode}
                        </span>
                        {row.needed && (
                          <span className="block text-xs text-slate-500">
                            {t('review.allocated')}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {row.status ? (
                          <Badge tone={STATUS_TONE[row.status]}>
                            {t(`statuses.${row.status}`)}
                          </Badge>
                        ) : (
                          <Badge tone="red">{t('review.notStarted')}</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums">
                        {hours(format, row.totalHours)}
                      </td>
                      {list.projects.map((p) => {
                        const cell = row.totals.find((x) => x.project?.id === p.id);
                        return (
                          <td key={p.id} className="py-2 pr-3 text-right tabular-nums">
                            {cell && Number(cell.hours) > 0 && (
                              <>
                                {hours(format, cell.hours)}
                                <span className="block text-xs text-slate-500">
                                  {format.number(Number(cell.percent) / 100, {
                                    style: 'percent',
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              </>
                            )}
                            {cell?.plannedPercent && (
                              <span className="block text-xs text-brand-700">
                                {t('grid.planned', { percent: Number(cell.plannedPercent) })}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {uncharged && Number(uncharged.hours) > 0 && hours(format, uncharged.hours)}
                      </td>
                      <td className="space-y-2 py-2">
                        {row.id && (
                          <div className="flex gap-3 text-xs">
                            <a
                              href={`/workspace/files/timesheets/${row.id}?language=en`}
                              className="font-medium text-brand-700 hover:underline"
                            >
                              {t('pdfEn')}
                            </a>
                            <a
                              href={`/workspace/files/timesheets/${row.id}?language=bn`}
                              className="font-medium text-brand-700 hover:underline"
                            >
                              {t('pdfBn')}
                            </a>
                          </div>
                        )}
                        {row.id && row.status && row.status !== 'draft' && (
                          <ReopenTimesheetForm id={row.id} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-500">{t('review.reopenNote')}</p>
    </>
  );
}
