'use client';
import { useTranslations } from 'next-intl';
import type { EmployeeDetail, FieldPolicy } from '@gp/shared';
import { updateEmployee } from '@/app/actions/hr';
import { ActionForm } from '@/components/hr/action-form';
import { Card, Field, inputClass } from '@/components/ui';
/** Sends only editable groups. Hidden fields are never resubmitted as blanks or masked text. */
export function ScopedEmployeeForm({
  employee: e,
  fields,
}: {
  employee: EmployeeDetail;
  fields: FieldPolicy;
}) {
  const t = useTranslations('hr.form'),
    ti = useTranslations('identity');
  return (
    <Card title={t('personal')}>
      <p className="mb-4 text-sm text-slate-500">{ti('partialEdit')}</p>
      <ActionForm action={updateEmployee.bind(null, e.id)} submitLabel={t('save')}>
        <Field label={t('fullName')}>
          <input className={inputClass} name="fullName" defaultValue={e.fullName} required />
        </Field>
        <Field label={t('fullNameBn')}>
          <input className={inputClass} name="fullNameBn" defaultValue={e.fullNameBn ?? ''} />
        </Field>
        {fields.identity.read && fields.identity.write && (
          <>
            <Field label={t('fatherName')}>
              <input className={inputClass} name="fatherName" defaultValue={e.fatherName ?? ''} />
            </Field>
            <Field label={t('motherName')}>
              <input className={inputClass} name="motherName" defaultValue={e.motherName ?? ''} />
            </Field>
            <Field label={t('dateOfBirth')}>
              <input
                className={inputClass}
                type="date"
                name="dateOfBirth"
                defaultValue={e.dateOfBirth ?? ''}
              />
            </Field>
          </>
        )}
        {fields.contacts.read && fields.contacts.write && (
          <>
            <Field label={t('mobilePhone')}>
              <input className={inputClass} name="mobilePhone" defaultValue={e.mobilePhone ?? ''} />
            </Field>
            <Field label={t('workEmail')}>
              <input
                className={inputClass}
                type="email"
                name="workEmail"
                defaultValue={e.workEmail ?? ''}
              />
            </Field>
            <Field label={t('personalEmail')}>
              <input
                className={inputClass}
                type="email"
                name="personalEmail"
                defaultValue={e.personalEmail ?? ''}
              />
            </Field>
          </>
        )}
      </ActionForm>
    </Card>
  );
}
