import { can, todayIn, type TimesheetView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { HelpLink } from '@/components/help/help-link';
import { PrefillForm, SubmitTimesheetForm } from '@/components/timesheets/timesheet-forms';
import { TimesheetGrid } from '@/components/timesheets/timesheet-grid';
import { STATUS_TONE } from '@/components/timesheets/labels';
import { monthTitle, StatusBanner } from '@/components/timesheets/timesheet-views';
import { Badge, buttonClass, Card } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';
import { MONTH, shiftMonth } from '@/lib/month';

export default async function MyTimesheetPage({
  searchParams,
}: PageProps<'/workspace/timesheets'>) {
  const t = await getTranslations('timesheets');
  const format = await getFormatter();
  const sp = await searchParams;
  const thisMonth = todayIn().slice(0, 7);
  const month =
    typeof sp.month === 'string' && MONTH.test(sp.month) && sp.month <= thisMonth
      ? sp.month
      : thisMonth;
  const [result, user] = await Promise.all([
    authedFetch<TimesheetView>('tenant', `/tenant/timesheets/me?month=${month}`),
    currentTenantUser(),
  ]);
  if (!result.ok) {
    return (
      <Card title={t('title')}>
        <p className="text-sm text-slate-600">
          {result.status === 404
            ? t('noEmployee')
            : result.error.code === 'feature_not_in_plan'
              ? t('notInPlan')
              : result.error.message}
        </p>
      </Card>
    );
  }
  const view = result.data;
  const hasHours = Number(view.totalHours) > 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {t('title')}
            <HelpLink slug="ngo-timesheets" />
          </h1>
          <p className="text-sm text-slate-600">{t('intro')}</p>
        </div>
        {can(user, 'projects.manage') && (
          <Link
            href={`/workspace/timesheets/review?month=${month}`}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {t('review.link')} →
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-lg font-semibold">
          {monthTitle(format, month)}
          <Badge tone={STATUS_TONE[view.status]}>{t(`statuses.${view.status}`)}</Badge>
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={`/workspace/timesheets?month=${shiftMonth(month, -1)}`}
            className="text-slate-600 hover:text-slate-900"
          >
            ← {t('previous')}
          </Link>
          {month < thisMonth && (
            <Link
              href={`/workspace/timesheets?month=${shiftMonth(month, 1)}`}
              className="text-slate-600 hover:text-slate-900"
            >
              {t('next')} →
            </Link>
          )}
          {view.id && (
            <>
              <a
                href={`/workspace/files/timesheets/${view.id}?language=en`}
                className={buttonClass.secondary}
              >
                {t('pdfEn')}
              </a>
              <a
                href={`/workspace/files/timesheets/${view.id}?language=bn`}
                className={buttonClass.secondary}
              >
                {t('pdfBn')}
              </a>
            </>
          )}
        </div>
      </div>

      <StatusBanner view={view} />

      <Card>
        {view.projects.some((p) => p.chargeable) || view.entries.length ? (
          <TimesheetGrid key={view.month} view={view} />
        ) : (
          <p className="text-sm text-slate-500">{t('noProjects')}</p>
        )}
      </Card>

      {view.editable && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t('prefill.title')}>
            <PrefillForm month={month} />
          </Card>
          <Card title={t('submit.title')}>
            {hasHours ? (
              <SubmitTimesheetForm month={month} />
            ) : (
              <p className="text-sm text-slate-500">{t('submit.empty')}</p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
