'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import type { InternationalState } from '@/app/actions/international';
import {
  hireInternationalEmployee,
  saveInternationalEmployee,
} from '@/app/actions/international-employees';
import { Banner, buttonClass, inputClass } from '@/components/ui';
export function InternationalEmployeeForm({
  op,
  employeeId,
  companyId,
  country,
  currency,
  originalName,
}: {
  op: 'hire' | 'employment-profiles' | 'identifiers' | 'banks';
  employeeId?: string;
  companyId: string;
  country: string;
  currency: string;
  originalName?: string;
}) {
  const t = useTranslations('international.employee'),
    [state, action, pending] = useActionState<InternationalState, FormData>(
      op === 'hire' ? hireInternationalEmployee : saveInternationalEmployee,
      undefined,
    );
  const fields =
    op === 'hire'
      ? [
          'employeeCode',
          'originalName',
          'dateOfBirth',
          'citizenship',
          'phone',
          'addressLine',
          'city',
          'region',
          'addressCountry',
          'joinedOn',
        ]
      : op === 'employment-profiles'
        ? [
            'effectiveFrom',
            'originalName',
            'translatedName',
            'citizenship',
            'insuranceClass',
            'contractClass',
            'suppliedHijriDate',
            'calendarProvenance',
            'reason',
          ]
        : op === 'identifiers'
          ? ['issuer', 'identifierValue', 'validTo']
          : ['provider', 'accountName', 'iban'];
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="employeeId" value={employeeId ?? ''} />
      <input type="hidden" name="legalEntityId" value={companyId} />
      <input type="hidden" name="country" value={country} />
      <input type="hidden" name="currency" value={currency} />
      {fields.map((key) => (
        <label key={key}>
          {t(key)}
          <input
            className={inputClass}
            name={key}
            type={
              ['effectiveFrom', 'dateOfBirth', 'joinedOn', 'validTo'].includes(key)
                ? 'date'
                : ['identifierValue', 'iban'].includes(key)
                  ? 'password'
                  : 'text'
            }
            autoComplete="off"
            dir={
              [
                'originalName',
                'translatedName',
                'addressLine',
                'city',
                'region',
                'reason',
                'accountName',
              ].includes(key)
                ? 'auto'
                : 'ltr'
            }
            defaultValue={
              key === 'originalName' ? originalName : key === 'addressCountry' ? country : undefined
            }
            required={
              !['translatedName', 'suppliedHijriDate', 'calendarProvenance', 'validTo'].includes(
                key,
              )
            }
            minLength={key === 'reason' ? 10 : undefined}
          />
        </label>
      ))}
      {op === 'hire' && (
        <>
          {['gender', 'contractClass', 'workerCategory'].map((key) => (
            <label key={key}>
              {t(key)}
              <select className={inputClass} required name={key}>
                <option value="">—</option>
                {(key === 'gender'
                  ? ['female', 'male', 'other']
                  : key === 'contractClass'
                    ? ['permanent', 'probationer', 'temporary']
                    : ['staff', 'worker']
                ).map((option) => (
                  <option key={option} value={option}>
                    {t(option)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </>
      )}
      {op === 'identifiers' && (
        <label>
          {t('kind')}
          <select className={inputClass} name="kind">
            {['passport', 'national_id', 'tax_id', 'visa', 'residency'].map((kind) => (
              <option value={kind} key={kind}>
                {t(kind)}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className={buttonClass.primary} disabled={pending}>
        {t('save')}
      </button>
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
    </form>
  );
}
