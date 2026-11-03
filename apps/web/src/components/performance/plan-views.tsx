import {
  PLAN_LAW_NOTE,
  RUNNING_PLAN_STATUSES,
  type EmployeeRef,
  type PlanListItem,
  type PlanStatus,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Badge, Banner, type Tone } from '../ui';

const DHAKA = 'Asia/Dhaka';

/** A person's name in the reader's language. */
export const nameOf = (p: EmployeeRef, locale: string) =>
  locale === 'bn' && p.fullNameBn ? p.fullNameBn : p.fullName;

/** Dates (and the day of an instant) in Dhaka, for plan and probation pages. */
export async function dhakaDay() {
  const format = await getFormatter();
  return (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeZone: DHAKA });
}

const PLAN_TONE: Record<PlanStatus, Tone> = {
  draft: 'slate',
  active: 'blue',
  extended: 'amber',
  successful: 'green',
  not_met: 'red',
  cancelled: 'slate',
};

export const isRunning = (status: PlanStatus) =>
  (RUNNING_PLAN_STATUSES as readonly PlanStatus[]).includes(status);

export async function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const t = await getTranslations('development.plans.statuses');
  return <Badge tone={PLAN_TONE[status]}>{t(status)}</Badge>;
}

/**
 * What every plan says about the law. The wording is PLAN_LAW_NOTE in @gp/shared, marked there
 * for the labour lawyer to confirm (Labour Act ss.23–24 and 26).
 */
export async function PlanLawNote() {
  const t = await getTranslations('development.plan');
  const locale = (await getLocale()) === 'bn' ? 'bn' : 'en';
  return (
    <Banner tone="slate">
      <span className="block font-semibold">{t('lawTitle')}</span>
      {PLAN_LAW_NOTE[locale]}
    </Banner>
  );
}

/** Plans as a table: the person (unless they are all the reader's), manager, period, status. */
export async function PlanTable({
  plans,
  showPerson = true,
}: {
  plans: PlanListItem[];
  showPerson?: boolean;
}) {
  const t = await getTranslations('development.plans');
  const locale = await getLocale();
  const day = await dhakaDay();
  if (plans.length === 0) return <p className="text-sm text-slate-500">{t('none')}</p>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-start text-xs text-slate-500">
          <tr>
            {showPerson && <th className="px-5 py-2 font-medium">{t('columns.person')}</th>}
            <th className="px-5 py-2 font-medium">{t('columns.manager')}</th>
            <th className="px-5 py-2 font-medium">{t('columns.period')}</th>
            <th className="px-5 py-2 font-medium">{t('columns.status')}</th>
            <th className="px-5 py-2 font-medium">{t('columns.acknowledged')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {plans.map((p) => (
            <tr key={p.id}>
              {showPerson && (
                <td className="px-5 py-2">
                  <Link
                    href={`/workspace/performance/plans/${p.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {nameOf(p.employee, locale)}
                  </Link>
                  <span className="block font-mono text-xs text-slate-400">
                    {p.employee.employeeCode}
                  </span>
                </td>
              )}
              <td className="px-5 py-2 text-slate-700">
                {p.manager ? nameOf(p.manager, locale) : t('noManager')}
              </td>
              <td className="px-5 py-2 whitespace-nowrap">
                {showPerson ? (
                  t('period', { start: day(p.startsOn), end: day(p.endsOn) })
                ) : (
                  <Link
                    href={`/workspace/performance/plans/${p.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t('period', { start: day(p.startsOn), end: day(p.endsOn) })}
                  </Link>
                )}
              </td>
              <td className="px-5 py-2">
                <PlanStatusBadge status={p.status} />
              </td>
              <td className="px-5 py-2 text-slate-600">
                {p.status === 'draft'
                  ? '–'
                  : p.acknowledgedAt
                    ? day(p.acknowledgedAt)
                    : t('notAcknowledged')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
