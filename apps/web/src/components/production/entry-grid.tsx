'use client';

import type { ProductionBatchResult, ProductionDayView, ProductionOperationView } from '@gp/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useActionState, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { saveProduction } from '@/app/actions/production';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText } from '../forms';
import { Badge, Banner, buttonClass, inputClass } from '../ui';
import { localName, personName } from './labels';

const shown = (quantity: number | undefined) => (quantity ? String(quantity) : '');
/** A row's input, unless the row is locked and has none. */
const typable = (el: HTMLInputElement | null | undefined) => !!el && !el.disabled;
/** Digits only, Bangla ones as typed on a Bangla keyboard included. */
const digits = (text: string) =>
  text.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/\D/g, '');

/**
 * One operation's pieces for everyone on a line that day, typed down the column: Enter or ↓
 * moves to the next worker, ↑ back, and past the last to Save. Only changed rows are sent,
 * and days whose pay is locked are shown but cannot be typed in.
 */
export function EntryGrid({
  view,
  operation,
}: {
  view: ProductionDayView;
  operation: ProductionOperationView;
}) {
  const t = useTranslations('production.entry');
  const format = useFormatter();
  const locale = useLocale();
  const [state, action] = useActionState<ActionState<ProductionBatchResult>, FormData>(
    saveProduction,
    undefined,
  );
  const [pending, start] = useTransition();
  // What was saved comes back in `view` after each save; what is typed stays here.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const saveButton = useRef<HTMLButtonElement | null>(null);

  const savedOf = (id: string) =>
    shown(view.workers.find((w) => w.employee.id === id)?.quantities[operation.id]);
  const valueOf = (id: string) => typed[id] ?? savedOf(id);
  const open = view.workers.filter((w) => !w.locked);
  const changed = open.filter((w) => valueOf(w.employee.id) !== savedOf(w.employee.id));
  const pieces = view.workers.reduce((sum, w) => sum + (Number(valueOf(w.employee.id)) || 0), 0);
  const target = operation.dailyTarget;
  const overTarget = target
    ? view.workers.filter((w) => Number(valueOf(w.employee.id)) > target).length
    : 0;

  function submit() {
    const data = new FormData();
    data.set('date', view.date);
    data.set('operationId', operation.id);
    for (const w of changed) data.set(`q.${w.employee.id}`, valueOf(w.employee.id));
    start(() => action(data));
  }

  function move(event: KeyboardEvent<HTMLInputElement>, at: number) {
    const by =
      event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' || event.key === 'Enter' ? 1 : 0;
    if (!by) return;
    event.preventDefault();
    const next = inputs.current.slice(at + 1).findIndex(typable);
    const previous = inputs.current.slice(0, at).findLastIndex(typable);
    if (by > 0 && next >= 0) inputs.current[at + 1 + next]?.focus();
    else if (by > 0) saveButton.current?.focus();
    else if (previous >= 0) inputs.current[previous]?.focus();
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
          {state.issues?.length ? (
            <ul className="mt-1 list-inside list-disc">
              {[...new Set(state.issues.map((i) => i.message))].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </Banner>
      )}
      {state?.ok && state.result && !pending && (
        <Banner tone="green">
          {t('saved', {
            saved: state.result.saved,
            removed: state.result.removed,
          })}
        </Banner>
      )}
      {!operation.isActive && <Banner tone="amber">{t('inactive')}</Banner>}
      {view.workers.length === 0 ? (
        <p className="text-sm text-slate-500">{t('nobody')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-medium">{t('worker')}</th>
                <th className="py-2 pr-3 font-medium">{t('designation')}</th>
                <th className="py-2 pr-3 font-medium">{t('line')}</th>
                <th className="py-2 pr-3 text-right font-medium">{t('otherOperations')}</th>
                <th className="w-32 py-2 font-medium">{t('pieces')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.workers.map((w, i) => {
                const id = w.employee.id;
                const value = valueOf(id);
                const others = Object.entries(w.quantities)
                  .filter(([op]) => op !== operation.id)
                  .reduce((sum, [, q]) => sum + q, 0);
                const above = target !== null && Number(value) > target;
                return (
                  <tr key={id} className={value !== savedOf(id) ? 'bg-amber-50' : undefined}>
                    <td className="py-1.5 pr-3">
                      <span className="font-medium">{personName(w.employee, locale)}</span>{' '}
                      <span className="font-mono text-xs text-slate-400">
                        {w.employee.employeeCode}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">
                      {locale === 'bn' && w.designationBn ? w.designationBn : w.designation}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">
                      {w.orgUnit ? localName(w.orgUnit, locale) : ''}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">
                      {others ? format.number(others) : ''}
                    </td>
                    <td className="py-1.5">
                      {w.locked ? (
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{value}</span>
                          <Badge tone="slate">{t('locked')}</Badge>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <input
                            ref={(el) => {
                              inputs.current[i] = el;
                            }}
                            value={value}
                            onChange={(event) =>
                              setTyped({ ...typed, [id]: digits(event.target.value) })
                            }
                            onKeyDown={(event) => move(event, i)}
                            onFocus={(event) => event.target.select()}
                            inputMode="numeric"
                            maxLength={6}
                            autoComplete="off"
                            aria-label={t('piecesFor', { name: w.employee.fullName })}
                            className={`${inputClass} w-24 text-right tabular-nums`}
                          />
                          {above && (
                            <span className="text-xs text-brand-700">
                              {t('above', { count: Number(value) - target })}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button
          ref={saveButton}
          type="submit"
          disabled={pending || changed.length === 0}
          aria-busy={pending}
          className={buttonClass.primary}
        >
          {pending ? '…' : t('save', { count: changed.length })}
        </button>
        <span className="text-sm text-slate-600">
          {t('total', { pieces })}
          {target !== null && ` · ${t('overTarget', { count: overTarget })}`}
        </span>
        <span className="text-xs text-slate-500">{t('keys')}</span>
      </div>
    </form>
  );
}
