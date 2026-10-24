import type { AttendanceDayView, AttendanceStatus, AttendanceTotals, PunchView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Badge, type Tone } from '../ui';
import { VoidPunchForm } from './attendance-forms';

export const ATTENDANCE_TONE: Record<AttendanceStatus, Tone> = {
  present: 'green',
  half_day: 'amber',
  absent: 'red',
  on_leave: 'blue',
  missing_punch: 'amber',
  off: 'slate',
  pending: 'slate',
};

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

/** A punch time, in the employee's time zone. */
export const clock = (format: Formatter, iso: string | null, timeZone: string) =>
  iso ? format.dateTime(new Date(iso), { timeStyle: 'short', timeZone }) : '–';

/** 495 minutes → 8:15, in the reader's digits. */
export const hm = (format: Formatter, minutes: number) =>
  `${format.number(Math.floor(minutes / 60))}:${format.number(minutes % 60, {
    minimumIntegerDigits: 2,
  })}`;

const weekdayDate = (format: Formatter, iso: string) =>
  format.dateTime(new Date(`${iso}T00:00:00Z`), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

export async function StatusBadge({ day }: { day: AttendanceDayView }) {
  const t = await getTranslations('attendance');
  if (day.status === 'off') {
    return <Badge tone="slate">{day.holidayName ?? t(`dayType.${day.dayType}`)}</Badge>;
  }
  return <Badge tone={ATTENDANCE_TONE[day.status]}>{t(`status.${day.status}`)}</Badge>;
}

/**
 * Days as a table. `correctHref` adds a link to ask for a correction on days that have
 * started and are not leave.
 */
export async function DaysTable({
  days,
  timeZone,
  today,
  correctHref,
}: {
  days: AttendanceDayView[];
  timeZone: string;
  today: string;
  correctHref?: (date: string) => string;
}) {
  const t = await getTranslations('attendance');
  const format = await getFormatter();
  const locale = await getLocale();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-2 pr-3 font-medium">{t('table.date')}</th>
            <th className="py-2 pr-3 font-medium">{t('table.status')}</th>
            <th className="py-2 pr-3 font-medium">{t('table.shift')}</th>
            <th className="py-2 pr-3 font-medium">{t('table.in')}</th>
            <th className="py-2 pr-3 font-medium">{t('table.out')}</th>
            <th className="py-2 pr-3 text-right font-medium">{t('table.worked')}</th>
            <th className="py-2 pr-3 text-right font-medium">{t('table.overtime')}</th>
            <th className="py-2 font-medium">{t('table.notes')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {days.map((d) => (
            <tr key={d.date} className={d.dayType === 'working' ? '' : 'bg-slate-50/60'}>
              <td className="whitespace-nowrap py-2 pr-3 text-slate-700">
                {weekdayDate(format, d.date)}
              </td>
              <td className="py-2 pr-3">
                {d.date > today && d.status === 'pending' ? (
                  <Badge tone="slate">{t('upcoming')}</Badge>
                ) : (
                  <StatusBadge day={d} />
                )}
              </td>
              <td className="whitespace-nowrap py-2 pr-3 text-slate-600">
                {d.shift && d.dayType === 'working'
                  ? locale === 'bn' && d.shift.nameBn
                    ? d.shift.nameBn
                    : d.shift.code
                  : ''}
              </td>
              <td className="whitespace-nowrap py-2 pr-3">{clock(format, d.firstIn, timeZone)}</td>
              <td className="whitespace-nowrap py-2 pr-3">{clock(format, d.lastOut, timeZone)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {d.workedMinutes ? hm(format, d.workedMinutes) : ''}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {d.overtimeMinutes ? hm(format, d.overtimeMinutes) : ''}
              </td>
              <td className="py-2">
                <div className="flex flex-wrap items-center gap-1">
                  {d.lateMinutes > 0 && (
                    <Badge tone="amber">
                      {t('late', { minutes: format.number(d.lateMinutes) })}
                    </Badge>
                  )}
                  {d.earlyOutMinutes > 0 && (
                    <Badge tone="amber">
                      {t('earlyOut', { minutes: format.number(d.earlyOutMinutes) })}
                    </Badge>
                  )}
                  {d.flags
                    .filter((f) => f !== 'late' && f !== 'early_out')
                    .map((f) => (
                      <Badge key={f} tone={f === 'over_daily_limit' ? 'red' : 'violet'}>
                        {t(`flag.${f}`)}
                      </Badge>
                    ))}
                  {d.leave && <Badge tone="blue">{d.leave.code}</Badge>}
                  {d.regularization && (
                    <Badge tone={d.regularization.status === 'pending' ? 'amber' : 'green'}>
                      {t(`correction.${d.regularization.status}`)}
                    </Badge>
                  )}
                  {correctHref &&
                    d.date <= today &&
                    d.status !== 'on_leave' &&
                    d.status !== 'off' &&
                    d.regularization?.status !== 'pending' && (
                      <Link
                        href={correctHref(d.date)}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        {t('correct')}
                      </Link>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function TotalsBar({ totals }: { totals: AttendanceTotals }) {
  const t = await getTranslations('attendance.totals');
  const format = await getFormatter();
  const stats: [string, string][] = [
    [t('present'), format.number(totals.present)],
    [t('halfDay'), format.number(totals.halfDay)],
    [t('absent'), format.number(totals.absent)],
    [t('onLeave'), format.number(totals.onLeave)],
    [t('missingPunch'), format.number(totals.missingPunch)],
    [t('late'), format.number(totals.late)],
    [t('worked'), hm(format, totals.workedMinutes)],
    [t('overtime'), hm(format, totals.overtimeMinutes)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="text-lg font-semibold tabular-nums text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export async function PunchList({
  punches,
  timeZone,
  voidable = false,
}: {
  punches: PunchView[];
  timeZone: string;
  voidable?: boolean;
}) {
  const t = await getTranslations('attendance');
  const format = await getFormatter();
  if (punches.length === 0) return <p className="text-sm text-slate-500">{t('noPunches')}</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {punches.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
          <span className={p.voided ? 'text-slate-400 line-through' : ''}>
            <span className="font-medium tabular-nums">
              {format.dateTime(new Date(p.punchedAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone,
              })}
            </span>{' '}
            <Badge tone="slate">{t(`source.${p.source}`)}</Badge>{' '}
            {p.device && <span className="text-xs text-slate-500">{p.device.name}</span>}
            {p.distanceM !== null && (
              <span className="text-xs text-slate-500">
                {' '}
                · {t('distance', { metres: format.number(p.distanceM) })}
              </span>
            )}
            {p.note && <span className="block text-xs text-slate-500">{p.note}</span>}
          </span>
          {voidable && !p.voided && <VoidPunchForm punchId={p.id} />}
          {p.voided && <Badge tone="red">{t('voided')}</Badge>}
        </li>
      ))}
    </ul>
  );
}
