import type { TimesheetApprovalItem, TimesheetProjectTotal, TimesheetView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Badge, Banner } from '../ui';
import { hours, projectLabel } from './labels';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

/** "October 2026" in the reader's language. */
export const monthTitle = (format: Formatter, month: string) =>
  format.dateTime(new Date(`${month}-01T00:00:00Z`), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

// Bangla has no AM/PM of its own (CLDR gives Latin letters), so its times are 24-hour.
const when = (format: Formatter, iso: string, locale: string) =>
  format.dateTime(new Date(iso), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
    ...(locale === 'bn' ? { hourCycle: 'h23' } : {}),
  });

/** Where the month stands: waiting, approved, returned or reopened. */
export async function StatusBanner({ view }: { view: TimesheetView }) {
  const t = await getTranslations('timesheets.status');
  const tl = await getTranslations('leave.step');
  const format = await getFormatter();
  const locale = await getLocale();
  const pending = view.steps.find((s) => s.status === 'pending');
  const rejected = view.steps.find((s) => s.status === 'rejected');
  if (view.status === 'submitted') {
    return (
      <Banner tone="amber">
        {t('submitted', {
          at: when(format, view.submittedAt!, locale),
          approver:
            pending?.kind === 'manager' && pending.approver
              ? pending.approver.fullName
              : tl(pending?.kind ?? 'hr'),
        })}
      </Banner>
    );
  }
  if (view.status === 'approved') {
    return (
      <Banner tone="green">
        {t('approved', {
          at: when(format, view.decidedAt!, locale),
          name: view.decidedBy?.fullName ?? tl('hr'),
        })}
      </Banner>
    );
  }
  if (view.status === 'rejected') {
    return (
      <Banner tone="red">
        {t('rejected', { name: rejected?.decidedBy ?? view.decidedBy?.fullName ?? '' })}
        {rejected?.comment && <span className="mt-1 block">“{rejected.comment}”</span>}
      </Banner>
    );
  }
  if (view.note) return <Banner tone="amber">{t('reopened', { note: view.note })}</Banner>;
  return view.needed ? <Banner tone="blue">{t('due')}</Banner> : null;
}

/** Hours by project with each one's share, and the plan to compare with. */
export async function ProjectTotals({ totals }: { totals: TimesheetProjectTotal[] }) {
  const t = await getTranslations('timesheets.grid');
  const format = await getFormatter();
  const locale = await getLocale();
  return (
    <ul className="space-y-0.5 text-sm text-slate-700">
      {totals.map((row) => (
        <li key={row.project?.id ?? 'none'}>
          {row.project ? projectLabel(row.project, locale) : t('uncharged')}:{' '}
          <span className="font-medium tabular-nums">
            {t('hoursShare', {
              hours: hours(format, row.hours),
              percent: Number(row.percent),
            })}
          </span>
          {row.plannedPercent !== null && (
            <span className="text-slate-500">
              {' '}
              ({t('planned', { percent: Number(row.plannedPercent) })})
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A timesheet waiting in the approvals inbox. */
export async function TimesheetApprovalCard({
  item: { kind, timesheet: s },
}: {
  item: TimesheetApprovalItem;
}) {
  const t = await getTranslations('timesheets.approval');
  const tl = await getTranslations('leave');
  const format = await getFormatter();
  const locale = await getLocale();
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium text-slate-900">
        {s.employee.fullName}{' '}
        <span className="font-mono text-xs text-slate-400">{s.employee.employeeCode}</span>
      </p>
      <p className="text-sm text-slate-700">
        {t('summary', { month: monthTitle(format, s.month), hours: hours(format, s.totalHours) })}
      </p>
      <ProjectTotals totals={s.totals} />
      <p className="text-sm">
        <a
          href={`/workspace/files/timesheets/${s.id}?language=${locale === 'bn' ? 'bn' : 'en'}`}
          className="font-medium text-brand-700 hover:underline"
        >
          {t('pdf')}
        </a>
      </p>
      <div className="flex gap-2">
        <Badge tone="violet">{t('badge')}</Badge>
        <Badge tone="blue">{tl(`step.${kind}`)}</Badge>
      </div>
    </div>
  );
}
