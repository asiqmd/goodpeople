'use client';

import {
  MFS_PROVIDERS,
  PAYMENT_METHODS,
  type PaymentAccountView,
  type PaymentMethod,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { savePaymentAccounts } from '@/app/actions/hr';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, SubmitButton } from '../forms';
import { Banner, buttonClass, inputClass } from '../ui';

interface Row {
  key: string;
  id?: string;
  method: PaymentMethod;
  provider: string;
  branchName: string;
  routingNumber: string;
  accountName: string;
  masked: string | null;
}

const fromView = (a: PaymentAccountView): Row => ({
  key: a.id,
  id: a.id,
  method: a.method,
  provider: a.provider ?? '',
  branchName: a.branchName ?? '',
  routingNumber: a.routingNumber ?? '',
  accountName: a.accountName ?? '',
  masked: a.accountNumberMasked,
});

/**
 * Bank, mobile wallet or cash. Saved numbers are never sent back to the browser: leaving the
 * number empty on a saved account keeps it.
 */
export function PaymentAccountsForm({
  employeeId,
  accounts,
}: {
  employeeId: string;
  accounts: PaymentAccountView[];
}) {
  const t = useTranslations('hr.detail');
  const tf = useTranslations('hr.form');
  const th = useTranslations('hr');
  const [state, action] = useActionState<ActionState, FormData>(
    savePaymentAccounts.bind(null, employeeId),
    undefined,
  );
  const [rows, setRows] = useState<Row[]>(accounts.map(fromView));
  const primaryIndex = Math.max(
    0,
    accounts.findIndex((a) => a.isPrimary),
  );
  const update = (key: string, patch: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const label = 'block text-sm font-medium';

  return (
    <Form state={state} action={action} className="space-y-4">
      <p className="text-sm text-slate-600">{t('paymentHint')}</p>
      {state?.error && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      {state?.issues?.length ? (
        <ul className="list-inside list-disc text-xs text-red-600">
          {state.issues.map((i) => (
            <li key={`${i.path}-${i.message}`}>{i.message}</li>
          ))}
        </ul>
      ) : null}
      {state?.ok && <Banner tone="green">{tf('saved')}</Banner>}
      {rows.length === 0 && <p className="text-sm text-slate-500">{t('noAccounts')}</p>}
      {rows.map((row, i) => (
        <fieldset
          key={row.key}
          className="grid gap-3 rounded-lg p-4 ring-1 ring-slate-200 sm:grid-cols-3"
        >
          {row.id && <input type="hidden" name={`rows.${i}.id`} value={row.id} />}
          <label className={label}>
            {t('method')}
            <select
              name={`rows.${i}.method`}
              value={row.method}
              onChange={(e) =>
                update(row.key, { method: e.target.value as PaymentMethod, provider: '' })
              }
              className={`${inputClass} mt-1`}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {th(`paymentMethods.${m}`)}
                </option>
              ))}
            </select>
          </label>
          {row.method === 'mfs' && (
            <label className={label}>
              {t('provider')}
              <select
                name={`rows.${i}.provider`}
                required
                value={row.provider}
                onChange={(e) => update(row.key, { provider: e.target.value })}
                className={`${inputClass} mt-1`}
              >
                <option value="">{tf('choose')}</option>
                {MFS_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {th(`mfsProviders.${p}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {row.method === 'bank' && (
            <>
              <label className={label}>
                {t('provider')}
                <input
                  name={`rows.${i}.provider`}
                  required
                  value={row.provider}
                  onChange={(e) => update(row.key, { provider: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className={label}>
                {t('branch')}
                <input
                  name={`rows.${i}.branchName`}
                  value={row.branchName}
                  onChange={(e) => update(row.key, { branchName: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className={label}>
                {t('routing')}
                <input
                  name={`rows.${i}.routingNumber`}
                  inputMode="numeric"
                  required
                  value={row.routingNumber}
                  onChange={(e) => update(row.key, { routingNumber: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </>
          )}
          {row.method !== 'cash' && (
            <>
              <label className={label}>
                {t('accountName')}
                <input
                  name={`rows.${i}.accountName`}
                  value={row.accountName}
                  onChange={(e) => update(row.key, { accountName: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className={label}>
                {t('accountNumber')}
                <input
                  name={`rows.${i}.accountNumber`}
                  inputMode="numeric"
                  autoComplete="off"
                  required={!row.id}
                  placeholder={row.masked ?? ''}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </>
          )}
          <div className="flex items-end justify-between gap-3 sm:col-span-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="primary" value={i} defaultChecked={i === primaryIndex} />
              {t('primary')}
            </label>
            <button
              type="button"
              className={buttonClass.ghost}
              onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}
            >
              {t('remove')}
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className={buttonClass.secondary}
        onClick={() =>
          setRows((all) => [
            ...all,
            {
              key: `new-${Date.now()}`,
              method: 'mfs',
              provider: '',
              branchName: '',
              routingNumber: '',
              accountName: '',
              masked: null,
            },
          ])
        }
      >
        {t('addAccount')}
      </button>
      <div>
        <SubmitButton>{tf('save')}</SubmitButton>
      </div>
    </Form>
  );
}
