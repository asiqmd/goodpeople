'use client';

import { TIMESHEET_DECLARATION, type TimesheetPrefillResult } from '@gp/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { ActionState } from '@/app/actions/platform';
import { prefillTimesheet, reopenTimesheet, submitTimesheet } from '@/app/actions/timesheets';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';

function Errors({ state }: { state: ActionState<unknown> }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

/** Fills the days attendance recorded and nothing was entered for, by the planned split. */
export function PrefillForm({ month }: { month: string }) {
  const t = useTranslations('timesheets.prefill');
  const [state, action] = useActionState<ActionState<TimesheetPrefillResult>, FormData>(
    prefillTimesheet.bind(null, month),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-2">
      <Errors state={state} />
      {state?.ok && state.result && (
        <Banner tone="green">{t('filled', { days: state.result.days })}</Banner>
      )}
      <p className="text-sm text-slate-600">{t('hint')}</p>
      <SubmitButton variant="secondary">{t('button')}</SubmitButton>
    </Form>
  );
}

/** The employee's declaration, then the month goes to their line manager. */
export function SubmitTimesheetForm({ month }: { month: string }) {
  const t = useTranslations('timesheets.submit');
  const locale = useLocale();
  const [state, action] = useActionState<ActionState, FormData>(
    submitTimesheet.bind(null, month),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-3">
      <Errors state={state} />
      <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
        <input type="checkbox" name="declaration" required className="mt-1" />
        <span>
          <span className="block font-medium text-slate-900">{t('declaration')}</span>
          <span className="text-slate-700">
            {TIMESHEET_DECLARATION[locale === 'bn' ? 'bn' : 'en']}
          </span>
        </span>
      </label>
      {issueFor(state, 'declaration') && (
        <p className="text-xs text-red-600">{t('declarationNeeded')}</p>
      )}
      <SubmitButton>{t('button')}</SubmitButton>
    </Form>
  );
}

/** HR sends a timesheet back to a draft, saying why. */
export function ReopenTimesheetForm({ id }: { id: string }) {
  const t = useTranslations('timesheets.review');
  const [state, action] = useActionState<ActionState, FormData>(
    reopenTimesheet.bind(null, id),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-2">
      <Errors state={state} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('reason')} error={issueFor(state, 'reason')}>
          <input name="reason" required minLength={3} maxLength={500} className={inputClass} />
        </Field>
        <SubmitButton variant="secondary">{t('reopen')}</SubmitButton>
      </div>
    </Form>
  );
}
