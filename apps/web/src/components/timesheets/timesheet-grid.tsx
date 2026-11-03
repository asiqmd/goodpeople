'use client';

import type { TimesheetEntriesResult, TimesheetProjectOption, TimesheetView } from '@gp/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import {
  useActionState,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from 'react';
import type { ActionState } from '@/app/actions/platform';
import { saveTimesheetEntries } from '@/app/actions/timesheets';
import { ErrorText } from '../forms';
import { Badge, Banner, buttonClass, inputClass } from '../ui';
import { cellName, hours, projectLabel } from './labels';

/** Digits and one decimal point, Bangla digits as typed on a Bangla keyboard included. */
const decimal = (text: string) =>
  text
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1');

const shown = (value: string | undefined) => (value && Number(value) ? String(Number(value)) : '');

/**
 * The month as a grid: a row per day, a column per project the person may charge and one for
 * work not charged to any. Off days and leave are shaded, attendance's hours sit beside each
 * day as a hint, and totals follow what is typed. Enter or ↓ moves down a column, ↑ back up;
 * only changed cells are sent.
 */
export function TimesheetGrid({ view }: { view: TimesheetView }) {
  const t = useTranslations('timesheets.grid');
  const tp = useTranslations('timesheets.problems');
  const format = useFormatter();
  const locale = useLocale();
  const [state, action] = useActionState<ActionState<TimesheetEntriesResult>, FormData>(
    saveTimesheetEntries.bind(null, view.month),
    undefined,
  );
  const [pending, start] = useTransition();
  // What was saved comes back in `view` after each save; what is typed stays here.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const saved = useMemo(
    () => new Map(view.entries.map((e) => [cellName(e.date, e.projectId), shown(e.hours)])),
    [view.entries],
  );
  // Projects added for this visit, beside the allocated ones and those with hours.
  const [added, setAdded] = useState<string[]>([]);
  const shownAsColumn = (p: TimesheetProjectOption) =>
    p.plannedPercent !== null ||
    added.includes(p.id) ||
    view.entries.some((e) => e.projectId === p.id);
  const columns: (TimesheetProjectOption | null)[] = [...view.projects.filter(shownAsColumn), null];
  const addable = view.projects.filter((p) => p.chargeable && !shownAsColumn(p));
  const savedOf = (name: string) => saved.get(name) ?? '';
  const valueOf = (name: string) => typed[name] ?? savedOf(name);
  // '7.50' typed over a saved 7.5 is no change.
  const isChanged = (name: string) => (Number(valueOf(name)) || 0) !== (Number(savedOf(name)) || 0);
  const changed = Object.keys(typed).filter(isChanged);
  const sumOf = (names: string[]) => names.reduce((s, name) => s + (Number(valueOf(name)) || 0), 0);
  const columnTotals = columns.map((p) =>
    sumOf(view.days.map((d) => cellName(d.date, p?.id ?? null))),
  );
  const total = columnTotals.reduce((s, h) => s + h, 0);
  const projectName = (id: string | null) => {
    const p = view.projects.find((x) => x.id === id);
    return p ? projectLabel(p, locale) : t('uncharged');
  };

  function submit() {
    const data = new FormData();
    for (const name of changed) data.set(name, valueOf(name));
    start(() => action(data));
  }

  function move(event: KeyboardEvent<HTMLInputElement>, row: number, column: number) {
    const by =
      event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' || event.key === 'Enter' ? 1 : 0;
    if (!by) return;
    event.preventDefault();
    inputs.current.get(`${row + by}:${column}`)?.focus();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      {state?.error && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      {state?.ok && state.result && !pending && (
        <Banner tone={state.result.refused.length ? 'amber' : 'green'}>
          {t('saved', { count: state.result.accepted.length })}
          {state.result.refused.length > 0 && (
            <ul className="mt-1 list-inside list-disc">
              {state.result.refused.map((r) => (
                <li key={`${r.date}.${r.projectId}.${r.code}`}>
                  {format.dateTime(new Date(`${r.date}T00:00:00Z`), {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  })}{' '}
                  · {projectName(r.projectId)}: {tp.has(r.code) ? tp(r.code) : r.message}
                </li>
              ))}
            </ul>
          )}
        </Banner>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-start text-xs text-slate-500">
            <tr>
              <th className="py-2 pe-3 font-medium">{t('day')}</th>
              <th className="py-2 pe-3 text-end font-medium">{t('attendance')}</th>
              {columns.map((p) => (
                <th key={p?.id ?? 'none'} className="min-w-24 py-2 pe-2 align-bottom font-medium">
                  {p ? (
                    <>
                      <span className="block font-mono text-slate-700">{p.code}</span>
                      <span className="block font-normal">
                        {locale === 'bn' && p.nameBn ? p.nameBn : p.name}
                      </span>
                      {p.plannedPercent !== null && (
                        <span className="block font-normal text-brand-700">
                          {t('planned', { percent: Number(p.plannedPercent) })}
                        </span>
                      )}
                    </>
                  ) : (
                    t('uncharged')
                  )}
                </th>
              ))}
              <th className="py-2 text-end font-medium">{t('dayTotal')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.days.map((d, row) => {
              const names = columns.map((p) => cellName(d.date, p?.id ?? null));
              const dayTotal = sumOf(names);
              return (
                <tr key={d.date} className={d.offDay || d.leave ? 'bg-slate-50' : undefined}>
                  <td className="py-1 pe-3 whitespace-nowrap">
                    <span className="font-medium">
                      {format.dateTime(new Date(`${d.date}T00:00:00Z`), {
                        day: 'numeric',
                        weekday: 'short',
                        timeZone: 'UTC',
                      })}
                    </span>{' '}
                    {d.holiday ? (
                      <Badge tone="violet">{d.holiday}</Badge>
                    ) : d.weekend ? (
                      <Badge tone="slate">{t('weekend')}</Badge>
                    ) : d.offDay ? (
                      <Badge tone="slate">{t('offDay')}</Badge>
                    ) : null}{' '}
                    {d.leave && (
                      <Badge tone="blue">
                        {t('leave', {
                          name: locale === 'bn' && d.leave.nameBn ? d.leave.nameBn : d.leave.name,
                        })}
                      </Badge>
                    )}
                  </td>
                  <td className="py-1 pe-3 text-end tabular-nums text-slate-400">
                    {d.workedHours ? hours(format, d.workedHours) : ''}
                  </td>
                  {names.map((name, column) => (
                    <td key={name} className="py-1 pe-2">
                      <input
                        ref={(el) => {
                          if (el) inputs.current.set(`${row}:${column}`, el);
                          else inputs.current.delete(`${row}:${column}`);
                        }}
                        value={valueOf(name)}
                        disabled={!view.editable}
                        onChange={(event) =>
                          setTyped({ ...typed, [name]: decimal(event.target.value) })
                        }
                        onKeyDown={(event) => move(event, row, column)}
                        onFocus={(event) => event.target.select()}
                        inputMode="decimal"
                        maxLength={5}
                        autoComplete="off"
                        aria-label={t('hoursFor', {
                          day: format.dateTime(new Date(`${d.date}T00:00:00Z`), {
                            dateStyle: 'medium',
                            timeZone: 'UTC',
                          }),
                          project: projectName(columns[column]?.id ?? null),
                        })}
                        className={`${inputClass} w-20 text-end tabular-nums ${
                          isChanged(name) ? 'bg-amber-50' : ''
                        }`}
                      />
                    </td>
                  ))}
                  <td
                    className={`py-1 text-end tabular-nums ${dayTotal > 24 ? 'font-semibold text-red-700' : ''}`}
                  >
                    {dayTotal ? hours(format, dayTotal) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-slate-200 text-sm font-semibold">
            <tr>
              <td className="py-2 pe-3">{t('total')}</td>
              <td />
              {columnTotals.map((h, i) => (
                <td key={columns[i]?.id ?? 'none'} className="py-2 pe-2 text-end tabular-nums">
                  {hours(format, h)}
                  <span className="block text-xs font-normal text-slate-500">
                    {format.number(total ? h / total : 0, {
                      style: 'percent',
                      maximumFractionDigits: 1,
                    })}
                  </span>
                </td>
              ))}
              <td className="py-2 text-end tabular-nums">{hours(format, total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {view.editable && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={pending || changed.length === 0}
            aria-busy={pending}
            className={buttonClass.primary}
          >
            {pending ? '…' : t('save', { count: changed.length })}
          </button>
          {addable.length > 0 && (
            <select
              value=""
              onChange={(event) => setAdded([...added, event.target.value])}
              aria-label={t('addProject')}
              className={`${inputClass} w-auto`}
            >
              <option value="">{t('addProject')}</option>
              {addable.map((p) => (
                <option key={p.id} value={p.id}>
                  {projectLabel(p, locale)}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-slate-500">{t('keys')}</span>
        </div>
      )}
    </form>
  );
}
