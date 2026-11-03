import { addDays, todayIn, weekdayOf, type LeaveCalendarView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { typeName } from '@/components/leave/leave-views';
import { Card } from '@/components/ui';
import { load } from '@/lib/api';

const monthStart = (month: string) => `${month}-01`;
const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

/** A month at a glance: one row per person on leave, one column per day. */
export default async function TeamCalendarPage({
  searchParams,
}: PageProps<'/workspace/leave/calendar'>) {
  const param = (await searchParams).month;
  const month =
    typeof param === 'string' && /^\d{4}-\d{2}$/.test(param) ? param : todayIn().slice(0, 7);
  const from = monthStart(month);
  const to = monthEnd(month);
  const view = await load<LeaveCalendarView>(
    'tenant',
    `/tenant/leave/calendar?from=${from}&to=${to}`,
  );
  const t = await getTranslations('leave.calendar');
  const format = await getFormatter();
  const locale = await getLocale();

  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const holidays = new Map(view.holidays.map((h) => [h.date, h]));
  const people = [...new Map(view.entries.map((e) => [e.employee.id, e.employee])).values()];
  const title = format.dateTime(new Date(`${from}T00:00:00Z`), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <Card
      title={`${t('title')} · ${title}`}
      action={
        <div className="flex gap-3 text-sm">
          <Link href={`/workspace/leave/calendar?month=${shiftMonth(month, -1)}`}>
            ← {t('previous')}
          </Link>
          <Link href={`/workspace/leave/calendar?month=${shiftMonth(month, 1)}`}>
            {t('next')} →
          </Link>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-sm bg-brand-500" /> {t('legendApproved')}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-sm bg-amber-300" /> {t('legendPending')}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-sm bg-sky-100 ring-1 ring-sky-300" /> {t('legendHoliday')}
        </span>
      </div>
      <div className="-mx-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-3 py-2 text-start font-medium text-slate-500" />
              {days.map((d) => (
                <th
                  key={d}
                  title={holidays.get(d)?.name}
                  className={`w-7 px-0.5 py-2 text-center font-medium ${
                    holidays.has(d)
                      ? 'bg-sky-50 text-sky-800'
                      : weekdayOf(d) === 5
                        ? 'text-slate-400'
                        : 'text-slate-600'
                  }`}
                >
                  {format.number(Number(d.slice(8)))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.length === 0 ? (
              <tr>
                <td
                  colSpan={days.length + 1}
                  className="px-5 py-8 text-center text-sm text-slate-500"
                >
                  {t('none')}
                </td>
              </tr>
            ) : (
              people.map((person) => (
                <tr key={person.id} className="border-t border-slate-100">
                  <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-2 text-sm">
                    {person.fullName}
                  </td>
                  {days.map((d) => {
                    const entry = view.entries.find(
                      (e) => e.employee.id === person.id && e.startDate <= d && e.endDate >= d,
                    );
                    return (
                      <td key={d} className={`px-0.5 py-1 ${holidays.has(d) ? 'bg-sky-50' : ''}`}>
                        {entry && (
                          <div
                            title={`${typeName(entry.leaveType, locale)} (${entry.status})`}
                            className={`h-5 rounded-sm text-center text-[10px] leading-5 text-white ${
                              entry.status === 'approved'
                                ? 'bg-brand-500'
                                : 'bg-amber-300 text-amber-900'
                            }`}
                          >
                            {entry.leaveType.code}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
