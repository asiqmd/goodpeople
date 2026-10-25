'use client';

import type { ProductionOperationView } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useTransition } from 'react';
import { createOperation, setOperationActive, updateOperation } from '@/app/actions/production';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';

/** A new operation, or changes to one: a piece rate, a daily target with its incentive, or both. */
export function OperationForm({ operation }: { operation?: ProductionOperationView }) {
  const t = useTranslations('production.operations');
  const [state, action] = useActionState<ActionState<ProductionOperationView>, FormData>(
    operation ? updateOperation.bind(null, operation.id) : createOperation,
    undefined,
  );
  // A new operation's form starts empty again after each one is added.
  const key = operation ? operation.id : state?.ok ? state.result?.id : 'new';
  return (
    <Form key={key} state={state} action={action} className="space-y-4">
      {state?.error && !state.issues?.length && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      {state?.ok && <Banner tone="green">{operation ? t('updated') : t('added')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t('code')} error={issueFor(state, 'code')}>
          <input
            name="code"
            required
            maxLength={30}
            defaultValue={operation?.code}
            className={`${inputClass} font-mono uppercase`}
          />
        </Field>
        <Field label={t('name')} error={issueFor(state, 'name')}>
          <input name="name" required defaultValue={operation?.name} className={inputClass} />
        </Field>
        <Field label={t('nameBn')} error={issueFor(state, 'nameBn')}>
          <input name="nameBn" defaultValue={operation?.nameBn ?? ''} className={inputClass} />
        </Field>
        <Field label={t('style')} hint={t('styleHint')} error={issueFor(state, 'style')}>
          <input name="style" defaultValue={operation?.style ?? ''} className={inputClass} />
        </Field>
        <Field
          label={t('pieceRate')}
          hint={t('pieceRateHint')}
          error={issueFor(state, 'pieceRate')}
        >
          <input
            name="pieceRate"
            inputMode="decimal"
            defaultValue={operation?.pieceRate ? String(Number(operation.pieceRate)) : ''}
            className={inputClass}
          />
        </Field>
        <Field
          label={t('dailyTarget')}
          hint={t('dailyTargetHint')}
          error={issueFor(state, 'dailyTarget')}
        >
          <input
            name="dailyTarget"
            type="number"
            min={1}
            defaultValue={operation?.dailyTarget ?? ''}
            className={inputClass}
          />
        </Field>
        <Field
          label={t('incentiveRate')}
          hint={t('incentiveRateHint')}
          error={issueFor(state, 'incentiveRate')}
        >
          <input
            name="incentiveRate"
            inputMode="decimal"
            defaultValue={operation?.incentiveRate ? String(Number(operation.incentiveRate)) : ''}
            className={inputClass}
          />
        </Field>
      </div>
      <p className="text-xs text-slate-500">{t('ratesNote')}</p>
      <SubmitButton>{operation ? t('save') : t('add')}</SubmitButton>
    </Form>
  );
}

export function ActiveToggle({ operation }: { operation: ProductionOperationView }) {
  const t = useTranslations('production.operations');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={`text-sm font-medium hover:underline ${
        operation.isActive ? 'text-red-700' : 'text-brand-700'
      }`}
      onClick={() => {
        if (!operation.isActive || window.confirm(t('deactivateConfirm', { code: operation.code })))
          start(async () => {
            await setOperationActive(operation.id, !operation.isActive);
          });
      }}
    >
      {operation.isActive ? t('deactivate') : t('activate')}
    </button>
  );
}
