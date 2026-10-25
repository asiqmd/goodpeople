'use client';

import type { CostTrendPoint, ReconciliationMapping } from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import {
  checkRunPayments,
  compareReconciliation,
  uploadReconciliation,
} from '@/app/actions/payroll-reports';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';

function Errors({ state }: { state: ActionState<unknown> }) {
  if (!state?.error) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

// ── Parallel runs ────────────────────────────────────────────────────────────

export function ReconcileUploadForm({ runId }: { runId: string }) {
  const t = useTranslations('payroll.reconcile');
  const [state, action] = useActionState(uploadReconciliation.bind(null, runId), undefined);
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('file')} hint={t('fileHint')}>
          <input
            name="file"
            type="file"
            required
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="block text-sm"
          />
        </Field>
        <SubmitButton variant="secondary">{t('upload')}</SubmitButton>
      </div>
    </Form>
  );
}

/** Which of their columns holds what: one choice per component and total of ours. */
export function ReconciliationMappingForm({
  id,
  headers,
  mapping,
  targets,
  compared,
}: {
  id: string;
  headers: string[];
  mapping: ReconciliationMapping;
  targets: { key: string; label: string }[];
  compared: boolean;
}) {
  const t = useTranslations('payroll.reconcile');
  const [state, action] = useActionState(compareReconciliation.bind(null, id), undefined);
  const options = (
    <>
      <option value="">{t('notCompared')}</option>
      {headers.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </>
  );
  return (
    <Form state={state} action={action} className="space-y-4 text-sm">
      <Errors state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('codeColumn')}>
          <select
            name="employeeCode"
            defaultValue={mapping.employeeCode}
            required
            className={inputClass}
          >
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('nameColumn')}>
          <select name="name" defaultValue={mapping.name ?? ''} className={inputClass}>
            {options}
          </select>
        </Field>
      </div>
      <p className="text-slate-600">{t('mappingHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {targets.map((target) => (
          <Field key={target.key} label={target.label}>
            <select
              name={`col.${target.key}`}
              defaultValue={mapping.columns[target.key] ?? ''}
              className={inputClass}
            >
              {options}
            </select>
          </Field>
        ))}
      </div>
      <SubmitButton>{compared ? t('compareAgain') : t('compare')}</SubmitButton>
    </Form>
  );
}

/** The bank's or wallet provider's report on a paid run: a returns file or statuses. */
export function PaymentCheckForm({ runId }: { runId: string }) {
  const t = useTranslations('payroll.payments.check');
  const [state, action] = useActionState(checkRunPayments.bind(null, runId), undefined);
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('file')} hint={t('fileHint')}>
          <input
            name="file"
            type="file"
            required
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="block text-sm"
          />
        </Field>
        <SubmitButton variant="secondary">{t('upload')}</SubmitButton>
      </div>
    </Form>
  );
}

// ── Cost over the months ─────────────────────────────────────────────────────

/**
 * What each month cost, as columns from one baseline; hovering or focusing a column shows
 * its month, cost and headcount. The table under it carries the same numbers.
 */
export function CostTrendChart({ points }: { points: CostTrendPoint[] }) {
  const t = useTranslations('payroll.reports');
  const format = useFormatter();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => Number(p.cost)), 1);
  const month = (m: string) =>
    format.dateTime(new Date(`${m}-01T00:00:00Z`), { month: 'short', timeZone: 'UTC' });
  const taka = (v: string) => `৳${format.number(Number(v), { maximumFractionDigits: 0 })}`;
  const last = points.findLastIndex((p) => Number(p.cost) > 0);
  const shown = active ?? last;
  return (
    <div className="space-y-2">
      <p className="h-5 text-sm text-slate-700" aria-live="polite">
        {shown >= 0 &&
          t('trendPoint', {
            month: format.dateTime(new Date(`${points[shown]!.month}-01T00:00:00Z`), {
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            }),
            cost: taka(points[shown]!.cost),
            people: points[shown]!.headcount,
          })}
      </p>
      <div className="flex h-40 items-end gap-0.5 border-b border-slate-200">
        {points.map((p, i) => {
          const height = (Number(p.cost) / max) * 100;
          return (
            <button
              key={p.month}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${p.month}: ${taka(p.cost)}`}
              className="group flex h-full flex-1 items-end justify-center"
            >
              <span
                className={`block w-full max-w-6 rounded-t ${
                  i === shown ? 'bg-brand-700' : 'bg-brand-600 group-hover:bg-brand-700'
                }`}
                style={{ height: `${Number(p.cost) > 0 ? Math.max(height, 1) : 0}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex gap-0.5 text-center text-[11px] text-slate-500">
        {points.map((p) => (
          <span key={p.month} className="flex-1 truncate">
            {month(p.month)}
          </span>
        ))}
      </div>
    </div>
  );
}
