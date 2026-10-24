import {
  addDays,
  todayIn,
  type AttendanceRangeView,
  type MyAttendanceToday,
  type RegularizationView,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  CancelRegularizationButton,
  PunchButton,
  RegularizationForm,
} from '@/components/attendance/attendance-forms';
import {
  clock,
  DaysTable,
  hm,
  PunchList,
  StatusBadge,
  TotalsBar,
} from '@/components/attendance/attendance-views';
import { day, STATUS_TONE } from '@/components/leave/leave-views';
import { Badge, Card } from '@/components/ui';
import { authedFetch, load } from '@/lib/api';
import { MONTH, monthRange, shiftMonth } from '@/lib/month';

export default async function MyAttendancePage({
  searchParams,
}: PageProps<'/workspace/attendance'>) {
  const t = await getTranslations('attendance');
  const format = await getFormatter();
  const locale = await getLocale();
  const sp = await searchParams;
  const today = await authedFetch<MyAttendanceToday>('tenant', '/tenant/me/attendance/today');
  if (!today.ok) {
    return (
      <Card title={t('my.title')}>
        <p className="text-sm text-slate-600">
          {today.status === 404 ? t('my.noEmployee') : today.error.message}
        </p>
      </Card>
    );
  }
  const { day: now, timeZone, selfPunch } = today.data;
  const todayDate = todayIn(timeZone);
  const month =
    typeof sp.month === 'string' && MONTH.test(sp.month) ? sp.month : todayDate.slice(0, 7);
  const { from, to } = monthRange(month);
  const correctDate = typeof sp.correct === 'string' && sp.correct <= todayDate ? sp.correct : null;
  const [range, corrections] = await Promise.all([
    load<AttendanceRangeView>('tenant', `/tenant/me/attendance?from=${from}&to=${to}`),
    load<RegularizationView[]>('tenant', '/tenant/me/attendance/regularizations'),
  ]);
  const shiftName = now.shift
    ? `${locale === 'bn' && now.shift.nameBn ? now.shift.nameBn : now.shift.name} · ${now.shift.startTime}–${now.shift.endTime}`
    : '';

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t('my.title')}</h1>
        <Link
          href="/workspace/attendance/team"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          {t('nav.team')} →
        </Link>
      </div>

      <Card title={t('my.today', { date: day(format, now.date) })}>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge day={now} />
              {now.dayType === 'working' && (
                <span className="text-sm text-slate-600">{shiftName}</span>
              )}
            </div>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">{t('table.in')}</dt>
                <dd className="text-lg font-semibold">{clock(format, now.firstIn, timeZone)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{t('table.out')}</dt>
                <dd className="text-lg font-semibold">{clock(format, now.lastOut, timeZone)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{t('table.worked')}</dt>
                <dd className="text-lg font-semibold">{hm(format, now.workedMinutes)}</dd>
              </div>
            </dl>
            {selfPunch.blockedReason ? (
              <p className="text-sm text-slate-500">
                {t(`punch.blocked.${selfPunch.blockedReason}`)}
              </p>
            ) : (
              <>
                <PunchButton
                  direction={today.data.nextDirection}
                  mode={selfPunch.mode}
                  requireSelfie={selfPunch.requireSelfie}
                />
                {selfPunch.mode === 'geofenced' && (
                  <p className="text-xs text-slate-500">
                    {t('punch.geofenced', {
                      metres: format.number(selfPunch.geofence?.radiusM ?? 0),
                    })}
                  </p>
                )}
              </>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-500">{t('my.punches')}</h3>
            <PunchList punches={today.data.punches} timeZone={timeZone} />
          </div>
        </div>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {format.dateTime(new Date(`${from}T00:00:00Z`), {
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </h2>
          <div className="flex gap-3 text-sm">
            <Link
              href={`/workspace/attendance?month=${shiftMonth(month, -1)}`}
              className="text-slate-600 hover:text-slate-900"
            >
              ← {t('my.previous')}
            </Link>
            {month < todayDate.slice(0, 7) && (
              <Link
                href={`/workspace/attendance?month=${shiftMonth(month, 1)}`}
                className="text-slate-600 hover:text-slate-900"
              >
                {t('my.next')} →
              </Link>
            )}
          </div>
        </div>
        <TotalsBar totals={range.totals} />
        <Card>
          {range.days.length === 0 ? (
            <p className="text-sm text-slate-500">{t('my.notTracked')}</p>
          ) : (
            <DaysTable
              days={range.days}
              timeZone={timeZone}
              today={todayDate}
              correctHref={(date) =>
                `/workspace/attendance?month=${month}&correct=${date}#correction`
              }
            />
          )}
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={<span id="correction">{t('correction.title')}</span>}>
          <RegularizationForm date={correctDate ?? addDays(todayDate, -1)} maxDate={todayDate} />
        </Card>
        <Card title={t('correction.mine')}>
          {corrections.length === 0 ? (
            <p className="text-sm text-slate-500">{t('correction.none')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {corrections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{day(format, c.date)}</span> ·{' '}
                    {t(`correction.kinds.${c.kind}`)}
                    {(c.inTime || c.outTime) && (
                      <span className="text-slate-600">
                        {' '}
                        · {c.inTime ?? '–'} → {c.outTime ?? '–'}
                      </span>
                    )}
                    <span className="block text-xs text-slate-500">{c.reason}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge tone={STATUS_TONE[c.status]}>{t(`correction.${c.status}`)}</Badge>
                    {c.status === 'pending' && <CancelRegularizationButton id={c.id} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
