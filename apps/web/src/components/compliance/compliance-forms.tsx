'use client';

import type { ComplianceSettingsView, LegalRef } from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, type ReactNode } from 'react';
import {
  acknowledgeAlert,
  runComplianceCheck,
  saveComplianceSettings,
  setNightConsent,
} from '@/app/actions/compliance';
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

/** HR records what was done about an alert; it stays on record, with who wrote it. */
export function AcknowledgeForm({ alertId }: { alertId: string }) {
  const t = useTranslations('compliance.alerts');
  const [state, action] = useActionState(acknowledgeAlert.bind(null, alertId), undefined);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-brand-700">{t('acknowledge')}</summary>
      <Form state={state} action={action} className="mt-2 space-y-2">
        <Errors state={state} />
        <textarea
          name="note"
          required
          minLength={3}
          maxLength={1000}
          rows={2}
          placeholder={t('notePlaceholder')}
          aria-label={t('note')}
          className={inputClass}
        />
        <SubmitButton variant="secondary">{t('acknowledge')}</SubmitButton>
      </Form>
    </details>
  );
}

/** Checks a range of days now; the hourly check covers the recent weeks on its own. */
export function CheckForm({ from, to }: { from: string; to: string }) {
  const t = useTranslations('compliance.overview');
  const format = useFormatter();
  const [state, action] = useActionState(runComplianceCheck, undefined);
  const n = (v: number) => format.number(v);
  return (
    <Form state={state} action={action} className="space-y-3">
      <Errors state={state} />
      {state?.result && (
        <Banner tone="green">
          {t('checked', {
            people: n(state.result.people),
            raised: n(state.result.raised),
            resolved: n(state.result.resolved),
          })}
        </Banner>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('from')} error={issueFor(state, 'from')}>
          <input type="date" name="from" defaultValue={from} max={to} className={inputClass} />
        </Field>
        <Field label={t('to')} error={issueFor(state, 'to')}>
          <input type="date" name="to" defaultValue={to} max={to} className={inputClass} />
        </Field>
        <SubmitButton variant="secondary">{t('checkNow')}</SubmitButton>
      </div>
    </Form>
  );
}

const toHours = (minutes: number | null) => (minutes === null ? '' : String(minutes / 60));

function CapField({
  name,
  label,
  value,
  law,
  hint,
  error,
  required = true,
}: {
  name: string;
  label: string;
  value: number | null;
  law: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      <span className="flex items-center gap-3">
        <input
          name={name}
          type="number"
          min={0}
          step={0.5}
          required={required}
          defaultValue={toHours(value)}
          className={`${inputClass} max-w-32`}
        />
        <span className="text-xs text-slate-500">{law}</span>
      </span>
    </Field>
  );
}

/** The company's overtime caps (often a buyer's code), in hours, beside the law's. */
export function SettingsForm({ settings }: { settings: ComplianceSettingsView }) {
  const t = useTranslations('compliance.settings');
  const tc = useTranslations('compliance');
  const format = useFormatter();
  const [state, action] = useActionState(saveComplianceSettings, undefined);
  const { law } = settings;
  const hours = (minutes: number) => format.number(minutes / 60, { maximumFractionDigits: 1 });
  const section = (reference: LegalRef) =>
    tc('section', {
      ref: reference.section.replace(/\d+/g, (d) =>
        format.number(Number(d), { useGrouping: false }),
      ),
    });
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-2">
        <CapField
          name="overtimeDailyCapHours"
          label={t('daily')}
          value={settings.overtimeDailyCapMinutes}
          error={issueFor(state, 'overtimeDailyCapHours')}
          law={t('lawAtMost', {
            hours: hours(law.overtimeDaily.minutes),
            section: section(law.overtimeDaily.reference),
          })}
        />
        <CapField
          name="overtimeWeeklyCapHours"
          label={t('weekly')}
          value={settings.overtimeWeeklyCapMinutes}
          error={issueFor(state, 'overtimeWeeklyCapHours')}
          law={t('lawAtMost', {
            hours: hours(law.overtimeWeekly.minutes),
            section: section(law.overtimeWeekly.reference),
          })}
        />
        <CapField
          name="overtimeMonthlyCapHours"
          label={t('monthly')}
          value={settings.overtimeMonthlyCapMinutes}
          error={issueFor(state, 'overtimeMonthlyCapHours')}
          hint={t('monthlyHint')}
          law={t('noLawMonthly')}
          required={false}
        />
        <Field label={t('warnAt')} hint={t('warnAtHint')} error={issueFor(state, 'warnAtPercent')}>
          <input
            name="warnAtPercent"
            type="number"
            min={50}
            max={100}
            required
            defaultValue={settings.warnAtPercent}
            className={`${inputClass} max-w-32`}
          />
        </Field>
      </div>
      <SubmitButton>{t('save')}</SubmitButton>
    </Form>
  );
}

/** A woman's written consent to work from 10 pm to 6 am, from a date (s.109). */
export function ConsentForm({
  employeeId,
  consentFrom,
}: {
  employeeId: string;
  consentFrom: string | null;
}) {
  const t = useTranslations('compliance.nightWork');
  const [state, action] = useActionState(setNightConsent.bind(null, employeeId), undefined);
  return (
    <Form state={state} action={action} className="space-y-2">
      <Errors state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          name="consentFrom"
          required
          defaultValue={consentFrom ?? ''}
          aria-label={t('consentFrom')}
          className={`${inputClass} max-w-44`}
        />
        <SubmitButton variant="secondary">{consentFrom ? t('change') : t('record')}</SubmitButton>
        {consentFrom && (
          <button type="submit" name="clear" value="1" formNoValidate className={buttonClass.ghost}>
            {t('clear')}
          </button>
        )}
      </div>
    </Form>
  );
}
