'use client';

import {
  BILLING_MODES,
  FEATURE_KEYS,
  INDUSTRY_TEMPLATES,
  type AssignCompanyResult,
  type PlanDefinition,
  type TenantWithAccess,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useRef, useState } from 'react';
import { addGrant, assignCompany, updateBilling, type ActionState } from '@/app/actions/platform';
import { issueFor, SubmitButton } from './forms';
import { Banner, buttonClass, Field, inputClass } from './ui';

function ReasonField({ state }: { state: ActionState<unknown> }) {
  const t = useTranslations('platform');
  return (
    <Field label={t('reason')} hint={t('reasonHint')} error={issueFor(state, 'reason')}>
      <input name="reason" required minLength={5} className={inputClass} />
    </Field>
  );
}

function PlanSelect({
  plans,
  defaultValue,
}: {
  plans: readonly PlanDefinition[];
  defaultValue: string;
}) {
  return (
    <select name="planCode" defaultValue={defaultValue} className={inputClass}>
      {plans.map((p) => (
        <option key={p.code} value={p.code}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function BillingModeSelect({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations('billingModes');
  return (
    <select name="billingMode" defaultValue={defaultValue} className={inputClass}>
      {BILLING_MODES.map((mode) => (
        <option key={mode} value={mode}>
          {t(mode)}
        </option>
      ))}
    </select>
  );
}

/** The Super Admin "Assign company" dialog: creates a workspace that can skip billing entirely. */
export function AssignCompanyDialog({ plans }: { plans: readonly PlanDefinition[] }) {
  const t = useTranslations('platform');
  const dialog = useRef<HTMLDialogElement>(null);
  // A new key remounts the form, so a one-time password is never shown twice. Reset when our
  // buttons close the dialog and on the native close event (Esc), which not every browser fires.
  const [formKey, setFormKey] = useState(0);
  const reset = () => setFormKey((k) => k + 1);
  const close = () => {
    dialog.current?.close();
    reset();
  };

  return (
    <>
      <button
        type="button"
        className={buttonClass.primary}
        onClick={() => dialog.current?.showModal()}
      >
        {t('assignCompany')}
      </button>
      <dialog
        ref={dialog}
        onClose={reset}
        className="m-auto w-full max-w-2xl rounded-2xl p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 className="text-lg font-semibold">{t('assignCompany')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('assignIntro')}</p>
          <AssignCompanyForm key={formKey} plans={plans} close={close} />
        </div>
      </dialog>
    </>
  );
}

function AssignCompanyForm({
  plans,
  close,
}: {
  plans: readonly PlanDefinition[];
  close: () => void;
}) {
  const t = useTranslations('platform');
  const tc = useTranslations('common');
  const ti = useTranslations('industries');
  const [state, action] = useActionState<ActionState<AssignCompanyResult>, FormData>(
    assignCompany,
    undefined,
  );
  const created = state?.result;

  if (created) {
    return (
      <div className="mt-6 space-y-4">
        <Banner tone="green">{t('assigned', { name: created.tenant.name })}</Banner>
        {created.temporaryPassword && (
          <div className="rounded-lg bg-slate-50 p-4 text-sm ring-1 ring-slate-200">
            <p>{t('tempPassword', { email: created.admin.email })}</p>
            <code className="mt-2 block select-all rounded bg-white px-3 py-2 font-mono text-base ring-1 ring-slate-200">
              {created.temporaryPassword}
            </code>
          </div>
        )}
        <button type="button" className={buttonClass.secondary} onClick={close}>
          {tc('close')}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 grid gap-4 sm:grid-cols-2">
      {state?.error && (
        <div className="sm:col-span-2">
          <Banner tone="red">{state.error}</Banner>
        </div>
      )}
      <Field label={t('name')} error={issueFor(state, 'name')}>
        <input name="name" required className={inputClass} />
      </Field>
      <Field label={t('slug')} error={issueFor(state, 'slug')}>
        <input
          name="slug"
          required
          pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
          className={inputClass}
        />
      </Field>
      <Field label={t('industry')}>
        <select name="industryTemplate" defaultValue="group" className={inputClass}>
          {INDUSTRY_TEMPLATES.map((i) => (
            <option key={i} value={i}>
              {ti(i)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('billingMode')}>
        <BillingModeSelect defaultValue="complimentary" />
      </Field>
      <Field label={t('plan')}>
        <PlanSelect plans={plans} defaultValue="enterprise" />
      </Field>
      <Field label={t('expiry')} hint={t('expiryHint')} error={issueFor(state, 'accessExpiresAt')}>
        <input name="accessExpiresAt" type="date" className={inputClass} />
      </Field>
      <Field
        label={t('maxEmployees')}
        hint={t('limitsHint')}
        error={issueFor(state, 'limits.max_employees')}
      >
        <input name="maxEmployees" type="number" min={1} className={inputClass} />
      </Field>
      <Field label={t('maxLegalEntities')} error={issueFor(state, 'limits.max_legal_entities')}>
        <input name="maxLegalEntities" type="number" min={1} className={inputClass} />
      </Field>
      <Field label={t('adminName')} error={issueFor(state, 'admin.name')}>
        <input name="adminName" required className={inputClass} />
      </Field>
      <Field label={t('adminEmail')} error={issueFor(state, 'admin.email')}>
        <input name="adminEmail" type="email" required className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <Field
          label={t('adminPassword')}
          hint={t('adminPasswordHint')}
          error={issueFor(state, 'admin.password')}
        >
          <input name="adminPassword" type="password" minLength={10} className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <ReasonField state={state} />
      </div>
      <div className="flex justify-end gap-3 sm:col-span-2">
        <button type="button" className={buttonClass.secondary} onClick={close}>
          {tc('cancel')}
        </button>
        <SubmitButton>{t('assignCompany')}</SubmitButton>
      </div>
    </form>
  );
}

export function BillingForm({
  tenant,
  plans,
}: {
  tenant: TenantWithAccess;
  plans: readonly PlanDefinition[];
}) {
  const t = useTranslations('platform');
  const tc = useTranslations('common');
  const [state, action] = useActionState<ActionState, FormData>(
    updateBilling.bind(null, tenant.id),
    undefined,
  );
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.ok && <Banner tone="green">✓</Banner>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('billingMode')}>
          <BillingModeSelect defaultValue={tenant.billingMode} />
        </Field>
        <Field label={t('plan')}>
          <PlanSelect plans={plans} defaultValue={tenant.planCode} />
        </Field>
      </div>
      <Field label={t('expiry')} hint={t('expiryHint')}>
        <input
          name="accessExpiresAt"
          type="date"
          defaultValue={tenant.accessExpiresAt?.slice(0, 10)}
          className={inputClass}
        />
      </Field>
      <ReasonField state={state} />
      <SubmitButton>{tc('save')}</SubmitButton>
    </form>
  );
}

export function GrantForm({ tenantId }: { tenantId: string }) {
  const t = useTranslations('platform');
  const tf = useTranslations('features');
  const [state, action] = useActionState<ActionState, FormData>(
    addGrant.bind(null, tenantId),
    undefined,
  );
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.ok && <Banner tone="green">✓</Banner>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('feature')}>
          <select name="key" className={inputClass}>
            {FEATURE_KEYS.map((f) => (
              <option key={f} value={f}>
                {tf(f)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('grantEnds')}>
          <input name="endsAt" type="date" className={inputClass} />
        </Field>
      </div>
      <ReasonField state={state} />
      <SubmitButton variant="secondary">{t('addGrant')}</SubmitButton>
    </form>
  );
}
