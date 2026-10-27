import type { ComponentStatus } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { DHAKA_DAY, dhakaDay } from './dhaka-time';
import { dayLook, FILL, StateIcon, type DayLook } from './status-look';

/** On small screens only the last 30 days fit as bars; the table always has them all. */
const PHONE_DAYS = 30;

/**
 * One part of the service: its state now, and a bar per day whose colour is the day's worst.
 * Each bar carries its date, uptime and state for screen readers and on hover, and the same
 * data is in a table behind a toggle.
 */
export async function ComponentRow({ component }: { component: ComponentStatus }) {
  const t = await getTranslations('status');
  const format = await getFormatter();
  const name = t(`components.${component.key}`);
  // A part we never check (payments) shows only the incidents posted on it.
  const hasChecks = component.days.some((d) => d.uptime !== null);
  const percent = (uptime: number) =>
    format.number(uptime, { style: 'percent', maximumFractionDigits: 2 });
  const days = component.days.map((d) => {
    const look: DayLook = dayLook(d, hasChecks);
    const date = format.dateTime(dhakaDay(d.date), DHAKA_DAY);
    const state = t(`states.${look}`);
    return {
      ...d,
      look,
      dateLabel: date,
      state,
      label:
        d.uptime === null
          ? t('barNoChecks', { date, state })
          : t('bar', { date, uptime: percent(d.uptime), state }),
    };
  });
  const older = days.length - PHONE_DAYS;
  return (
    <div className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="font-medium text-slate-900">{name}</h3>
          <p className="text-xs text-slate-500">{t(`componentHints.${component.key}`)}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <StateIcon state={component.state} />
          {t(`states.${component.state}`)}
        </span>
      </div>
      <ul aria-label={t('history', { name, count: days.length })} className="mt-3 flex h-8 gap-0.5">
        {days.map((d, i) => (
          <li
            key={d.date}
            className={`group relative flex-1 ${i < older ? 'hidden sm:block' : ''}`}
          >
            <span
              aria-hidden
              className={`block h-full rounded-[2px] ${FILL[d.look]} group-hover:opacity-70`}
            />
            <span className="sr-only">{d.label}</span>
            <span
              aria-hidden
              className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden w-max max-w-60 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block ${
                i < days.length / 2 ? 'left-0' : 'right-0'
              }`}
            >
              <span className="block font-semibold">
                {d.uptime === null ? d.state : `${percent(d.uptime)} · ${d.state}`}
              </span>
              <span className="block text-slate-300">{d.dateLabel}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="hidden sm:inline">{t('daysAgo', { count: days.length })}</span>
        <span className="sm:hidden">{t('daysAgo', { count: PHONE_DAYS })}</span>
        <span>
          {component.uptime === null
            ? t('incidentsOnly')
            : t('uptime', { uptime: percent(component.uptime) })}
        </span>
        <span>{t('today')}</span>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900">
          {t('showTable')}
        </summary>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-lg ring-1 ring-slate-200">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{t('history', { name, count: days.length })}</caption>
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-medium">{t('tableDate')}</th>
                <th className="px-3 py-1.5 text-right font-medium">{t('tableUptime')}</th>
                <th className="px-3 py-1.5 font-medium">{t('tableState')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {days.toReversed().map((d) => (
                <tr key={d.date}>
                  <td className="px-3 py-1.5">{d.dateLabel}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {d.uptime === null ? '–' : percent(d.uptime)}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <StateIcon state={d.look} className="size-4" />
                      {d.state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
