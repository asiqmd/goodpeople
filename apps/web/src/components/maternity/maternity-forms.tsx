'use client';

import {
  MATERNITY_PAY_METHODS,
  MATERNITY_PAYMENT_OPTIONS,
  type MaternityLeaveRef,
  type MaternityPaymentOption,
} from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import {
  cancelMaternityCase,
  closeMaternityCase,
  linkMaternityLeave,
  openMaternityCase,
  recordMaternityPayment,
  saveMaternityDates,
  setMaternityAverage,
} from '@/app/actions/maternity';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

function Errors({ state }: { state: ActionState }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

function Saved({ state }: { state: ActionState }) {
  const t = useTranslations('maternity.detail');
  return state?.ok ? <Banner tone="green">{t('saved')}</Banner> : null;
}

/** The three ways s.47(4) lets her be paid, each in plain words. */
function PaymentOptions({ defaultValue }: { defaultValue: MaternityPaymentOption }) {
  const t = useTranslations('maternity.options');
  const [chosen, setChosen] = useState(defaultValue);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {MATERNITY_PAYMENT_OPTIONS.map((option) => (
        <label
          key={option}
          className={`flex cursor-pointer flex-col gap-1 rounded-xl p-4 text-sm ring-1 ${
            chosen === option ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-slate-200'
          }`}
        >
          <span className="flex items-center gap-2 font-semibold">
            <input
              type="radio"
              name="paymentOption"
              value={option}
              checked={chosen === option}
              onChange={() => setChosen(option)}
            />
            {t(`${option}.title`)}
          </span>
          <span className="text-slate-600">{t(`${option}.body`)}</span>
          <span className="text-xs text-slate-400">{t(`${option}.section`)}</span>
        </label>
      ))}
    </div>
  );
}

/** Opens a case at her notice: dates, children, nominee and how she wants to be paid. */
export function NewMaternityCaseForm({ employeeId, today }: { employeeId: string; today: string }) {
  const t = useTranslations('maternity.form');
  const [state, action] = useActionState(openMaternityCase, undefined);
  return (
    <Form state={state} action={action} className="space-y-5">
      <Errors state={state} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('noticeOn')} hint={t('noticeHint')} error={issueFor(state, 'noticeOn')}>
          <input
            type="date"
            name="noticeOn"
            required
            max={today}
            defaultValue={today}
            className={inputClass}
          />
        </Field>
        <Field
          label={t('expectedDeliveryOn')}
          hint={t('expectedHint')}
          error={issueFor(state, 'expectedDeliveryOn')}
        >
          <input type="date" name="expectedDeliveryOn" required className={inputClass} />
        </Field>
        <Field
          label={t('survivingChildren')}
          hint={t('childrenHint')}
          error={issueFor(state, 'survivingChildren')}
        >
          <input
            type="number"
            name="survivingChildren"
            required
            min={0}
            max={20}
            defaultValue={0}
            className={inputClass}
          />
        </Field>
        <Field
          label={t('nomineeName')}
          hint={t('nomineeHint')}
          error={issueFor(state, 'nomineeName')}
        >
          <input name="nomineeName" className={inputClass} />
        </Field>
        <Field label={t('nomineeRelation')} error={issueFor(state, 'nomineeRelation')}>
          <input name="nomineeRelation" className={inputClass} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">{t('paymentOption')}</legend>
        <PaymentOptions defaultValue="before_and_after" />
      </fieldset>
      <details
        className="rounded-lg bg-slate-50 p-4 text-sm"
        open={state?.code === 'maternity_average_needed'}
      >
        <summary className="cursor-pointer font-medium text-slate-800">{t('averageTitle')}</summary>
        <p className="mt-2 text-slate-600">{t('averageHint')}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label={t('averageDailyWage')} error={issueFor(state, 'averageDailyWage')}>
            <input name="averageDailyWage" inputMode="decimal" className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('averageReason')} error={issueFor(state, 'averageReason')}>
              <input name="averageReason" className={inputClass} />
            </Field>
          </div>
        </div>
      </details>
      <Field label={t('note')} error={issueFor(state, 'note')}>
        <textarea name="note" rows={2} className={inputClass} />
      </Field>
      <SubmitButton>{t('submit')}</SubmitButton>
    </Form>
  );
}

/** The expected delivery as revised, the delivery and proof of birth. */
export function MaternityDatesForm({
  id,
  expectedDeliveryOn,
  deliveredOn,
  proofOn,
  today,
}: {
  id: string;
  expectedDeliveryOn: string;
  deliveredOn: string | null;
  proofOn: string | null;
  today: string;
}) {
  const t = useTranslations('maternity.detail');
  const [state, action] = useActionState(saveMaternityDates.bind(null, id), undefined);
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      <Saved state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('expectedDeliveryOn')} error={issueFor(state, 'expectedDeliveryOn')}>
          <input
            type="date"
            name="expectedDeliveryOn"
            required
            defaultValue={expectedDeliveryOn}
            className={inputClass}
          />
        </Field>
        <Field label={t('deliveredOn')} error={issueFor(state, 'deliveredOn')}>
          <input
            type="date"
            name="deliveredOn"
            max={today}
            defaultValue={deliveredOn ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('proofOn')} hint={t('proofHint')} error={issueFor(state, 'proofOn')}>
          <input
            type="date"
            name="proofOn"
            max={today}
            defaultValue={proofOn ?? ''}
            className={inputClass}
          />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('saveDates')}</SubmitButton>
    </Form>
  );
}

/** Works the average out again from locked payroll, or takes HR's figure with a reason. */
export function MaternityAverageForms({ id }: { id: string }) {
  const t = useTranslations('maternity.detail');
  const [again, recalculate] = useActionState(setMaternityAverage.bind(null, id), undefined);
  const [state, action] = useActionState(setMaternityAverage.bind(null, id), undefined);
  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <form action={recalculate} className="space-y-2">
        <Errors state={again} />
        <SubmitButton variant="secondary">{t('recalculate')}</SubmitButton>
      </form>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">{t('enterAverage')}</summary>
        <Form state={state} action={action} className="mt-3 space-y-3">
          <Errors state={state} />
          <Saved state={state} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('averageDailyWage')} error={issueFor(state, 'averageDailyWage')}>
              <input name="averageDailyWage" required inputMode="decimal" className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('averageReason')} error={issueFor(state, 'reason')}>
                <input name="reason" required className={inputClass} />
              </Field>
            </div>
          </div>
          <SubmitButton variant="secondary">{t('saveAverage')}</SubmitButton>
        </Form>
      </details>
    </div>
  );
}

/** Records a part as paid: the day, how, and the voucher or transaction reference. */
export function MaternityPaymentForm({
  id,
  part,
  today,
}: {
  id: string;
  part: number;
  today: string;
}) {
  const t = useTranslations('maternity.detail');
  const [state, action] = useActionState(recordMaternityPayment.bind(null, id, part), undefined);
  return (
    <Form state={state} action={action} className="space-y-2">
      <Errors state={state} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('paidOnLabel')} error={issueFor(state, 'paidOn')}>
          <input
            type="date"
            name="paidOn"
            required
            max={today}
            defaultValue={today}
            className={inputClass}
          />
        </Field>
        <Field label={t('method')}>
          <select name="method" required className={inputClass}>
            {MATERNITY_PAY_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`methods.${m}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('reference')} error={issueFor(state, 'reference')}>
          <input name="reference" className={inputClass} />
        </Field>
        <SubmitButton>{t('pay')}</SubmitButton>
      </div>
    </Form>
  );
}

/** Links her maternity leave to the case, or unlinks it. */
export function MaternityLeaveForm({
  id,
  linked,
  options,
}: {
  id: string;
  linked: MaternityLeaveRef | null;
  options: MaternityLeaveRef[];
}) {
  const t = useTranslations('maternity.detail');
  const ts = useTranslations('leave.status');
  const format = useFormatter();
  const [state, action] = useActionState(linkMaternityLeave.bind(null, id), undefined);
  const date = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  const label = (l: MaternityLeaveRef) =>
    t('leaveSpan', {
      from: date(l.startDate),
      to: date(l.endDate),
      days: l.days,
      status: ts(l.status),
    });
  return (
    <div className="space-y-3">
      <Errors state={state} />
      {linked && (
        <form action={action} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium text-slate-800">{label(linked)}</span>
          <input type="hidden" name="leaveRequestId" value="" />
          <button className={buttonClass.ghost}>{t('unlink')}</button>
        </form>
      )}
      {options.length > 0 ? (
        <Form state={state} action={action} className="flex flex-wrap items-end gap-2">
          <Field label={linked ? t('leaveReplace') : t('leaveChoose')}>
            <select name="leaveRequestId" required className={inputClass}>
              {options.map((l) => (
                <option key={l.id} value={l.id}>
                  {label(l)}
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton variant="secondary">{t('link')}</SubmitButton>
        </Form>
      ) : (
        !linked && <p className="text-sm text-slate-500">{t('noLeave')}</p>
      )}
    </div>
  );
}

/** Closes the case once every part is paid or lost. */
export function CloseMaternityCaseForm({ id }: { id: string }) {
  const t = useTranslations('maternity.detail');
  const [state, action] = useActionState(closeMaternityCase.bind(null, id), undefined);
  return (
    <Form state={state} action={action} className="space-y-2">
      <Errors state={state} />
      <p className="text-sm text-slate-600">{t('closeHint')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('closeNote')}>
          <input name="note" className={inputClass} />
        </Field>
        <SubmitButton variant="secondary">{t('close')}</SubmitButton>
      </div>
    </Form>
  );
}

/** Cancels a case opened in error, before anything is paid. */
export function CancelMaternityCaseForm({ id }: { id: string }) {
  const t = useTranslations('maternity.detail');
  const [state, action] = useActionState(cancelMaternityCase.bind(null, id), undefined);
  return (
    <Form
      state={state}
      action={action}
      className="space-y-2"
      onSubmit={(e) => {
        if (!window.confirm(t('cancelConfirm'))) e.preventDefault();
      }}
    >
      <Errors state={state} />
      <p className="text-sm text-slate-600">{t('cancelHint')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('cancelReason')} error={issueFor(state, 'reason')}>
          <input name="reason" required minLength={5} className={inputClass} />
        </Field>
        <SubmitButton variant="secondary">{t('cancel')}</SubmitButton>
      </div>
    </Form>
  );
}
