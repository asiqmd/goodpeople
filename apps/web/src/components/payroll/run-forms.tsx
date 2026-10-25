'use client';

import type { PayComponentView, PayGroupView, PayrollRunView } from '@gp/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import {
  createAdjustment,
  createRun,
  removeRunInput,
  runStep,
  setRunInput,
} from '@/app/actions/payroll';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

function Errors({ state }: { state: ActionState<unknown> }) {
  if (!state?.error) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

/** Opens a month for a pay group; the payment date defaults to the legal deadline. */
export function NewRunForm({ groups, month }: { groups: PayGroupView[]; month: string }) {
  const t = useTranslations('payroll.runs');
  const [state, action] = useActionState(createRun, undefined);
  const monthly = groups.filter((g) => g.isActive && g.frequency === 'monthly');
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('group')} error={issueFor(state, 'payGroupId')}>
          <select
            name="payGroupId"
            className={inputClass}
            defaultValue={monthly.find((g) => g.isDefault)?.id}
          >
            {monthly.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('month')} error={issueFor(state, 'month')}>
          <input type="month" name="month" defaultValue={month} required className={inputClass} />
        </Field>
        <Field
          label={t('paymentDate')}
          hint={t('paymentDateHint')}
          error={issueFor(state, 'paymentDate')}
        >
          <input type="date" name="paymentDate" className={inputClass} />
        </Field>
      </div>
      <SubmitButton>{t('create')}</SubmitButton>
    </Form>
  );
}

/** What can happen to a run next, for its status and the viewer's role. */
export function RunActions({ run, canManage }: { run: PayrollRunView; canManage: boolean }) {
  const t = useTranslations('payroll.runs');
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState>();
  const step = (name: 'compute' | 'submit' | 'cancel' | 'publish', confirm?: string) => () => {
    if (confirm && !window.confirm(confirm)) return;
    start(async () => setResult(await runStep(run.id, name)));
  };
  if (!canManage) return null;
  const open = run.status === 'draft' || run.status === 'computed';
  return (
    <div className="space-y-3">
      <Errors state={result} />
      <div className="flex flex-wrap gap-2">
        {open && (
          <button
            type="button"
            disabled={pending}
            className={run.status === 'draft' ? buttonClass.primary : buttonClass.secondary}
            onClick={step('compute')}
          >
            {run.computedAt ? t('recompute') : t('compute')}
          </button>
        )}
        {run.status === 'computed' && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass.primary}
            onClick={step('submit', t('submitConfirm'))}
          >
            {t('submit')}
          </button>
        )}
        {run.status === 'locked' && !run.publishedAt && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass.primary}
            onClick={step('publish', t('publishConfirm', { count: run.headcount }))}
          >
            {t('publish')}
          </button>
        )}
        {run.status === 'locked' && run.kind === 'regular' && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass.secondary}
            onClick={() => {
              if (!window.confirm(t('adjustConfirm'))) return;
              start(async () => setResult(await createAdjustment(run.id)));
            }}
          >
            {t('adjust')}
          </button>
        )}
        {(open || run.status === 'pending') && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass.ghost}
            onClick={step('cancel', t('cancelConfirm'))}
          >
            {t('cancel')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Enters an amount for one person in a run, such as an advance to recover. */
export function RunInputForm({
  runId,
  employeeId,
  components,
}: {
  runId: string;
  employeeId: string;
  components: PayComponentView[];
}) {
  const t = useTranslations('payroll.runs');
  const locale = useLocale();
  const [state, action] = useActionState<ActionState, FormData>(
    setRunInput.bind(null, runId, employeeId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-3">
      <Errors state={state} />
      {state?.ok && <Banner tone="green">{t('inputSaved')}</Banner>}
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_1fr_auto] sm:items-end">
        <Field label={t('component')} error={issueFor(state, 'component')}>
          <select name="component" className={inputClass}>
            {components.map((c) => (
              <option key={c.code} value={c.code}>
                {locale === 'bn' && c.nameBn ? c.nameBn : c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('amount')} error={issueFor(state, 'amount')}>
          <input name="amount" inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label={t('note')} error={issueFor(state, 'note')}>
          <input name="note" maxLength={200} className={inputClass} />
        </Field>
        <SubmitButton variant="secondary">{t('enter')}</SubmitButton>
      </div>
    </Form>
  );
}

export function RemoveInputButton({
  runId,
  employeeId,
  component,
}: {
  runId: string;
  employeeId: string;
  component: string;
}) {
  const t = useTranslations('payroll.runs');
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState>();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={buttonClass.ghost}
        onClick={() =>
          start(async () => setResult(await removeRunInput(runId, employeeId, component)))
        }
      >
        {t('removeInput')}
      </button>
      {result?.error && (
        <span className="text-xs text-red-600">
          <ErrorText state={result} />
        </span>
      )}
    </>
  );
}
