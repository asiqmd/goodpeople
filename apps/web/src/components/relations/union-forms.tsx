'use client';

import {
  UNION_ROLES,
  type Ref,
  type TradeUnionSummaryView,
  type UnionMemberView,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  addUnionMember,
  addUnionMembers,
  createUnion,
  deleteUnion,
  endUnionMember,
  setUnionConsent,
  updateUnion,
} from '@/app/actions/relations';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';
import { ActionButton, Errors, Saved } from './form-bits';

/** The union's own details; the company is chosen once, when it is created. */
function UnionFields({
  union,
  state,
}: {
  union?: TradeUnionSummaryView;
  state: { issues?: { path: string; message: string }[] } | undefined;
}) {
  const t = useTranslations('relations.unions.fields');
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('name')} error={issueFor(state, 'name')}>
          <input
            name="name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={union?.name}
            className={inputClass}
          />
        </Field>
        <Field label={t('registrationNo')} error={issueFor(state, 'registrationNo')}>
          <input
            name="registrationNo"
            maxLength={60}
            defaultValue={union?.registrationNo ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('registeredOn')} error={issueFor(state, 'registeredOn')}>
          <input
            type="date"
            name="registeredOn"
            defaultValue={union?.registeredOn ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('federation')}>
          <input
            name="federation"
            maxLength={200}
            defaultValue={union?.federation ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('monthlySubscription')} error={issueFor(state, 'monthlySubscription')}>
          <input
            name="monthlySubscription"
            inputMode="decimal"
            defaultValue={union?.monthlySubscription ?? ''}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="isCba" defaultChecked={union?.isCba} className="mt-1" />
          <span>
            <span className="font-medium text-slate-800">{t('isCba')}</span>
            <span className="block text-xs text-slate-500">{t('isCbaHint')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="checkOff"
            defaultChecked={union?.checkOff}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-slate-800">{t('checkOff')}</span>
            <span className="block text-xs text-slate-500">{t('checkOffHint')}</span>
          </span>
        </label>
      </div>
      <Field label={t('note')}>
        <textarea
          name="note"
          rows={2}
          maxLength={2000}
          defaultValue={union?.note ?? ''}
          className={inputClass}
        />
      </Field>
    </>
  );
}

export function UnionForm({ entities }: { entities: Ref[] }) {
  const t = useTranslations('relations.unions');
  const [state, action] = useActionState(createUnion, undefined);
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      <div className="sm:w-1/3">
        <Field label={t('fields.legalEntity')} error={issueFor(state, 'legalEntityId')}>
          <select name="legalEntityId" required className={inputClass}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <UnionFields state={state} />
      <SubmitButton>{t('create')}</SubmitButton>
    </Form>
  );
}

export function UnionEditForm({ union }: { union: TradeUnionSummaryView }) {
  const t = useTranslations('relations');
  const [state, action] = useActionState(updateUnion.bind(null, union.id), undefined);
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <UnionFields union={union} state={state} />
      <SubmitButton>{t('save')}</SubmitButton>
    </Form>
  );
}

export function DeleteUnionButton({ id }: { id: string }) {
  const t = useTranslations('relations.union');
  return (
    <ActionButton
      label={t('delete')}
      confirm={t('deleteConfirm')}
      run={() => deleteUnion(id)}
      className={buttonClass.secondary}
    />
  );
}

export function UnionMemberForm({ unionId, today }: { unionId: string; today: string }) {
  const t = useTranslations('relations');
  const tu = useTranslations('relations.union');
  const [state, action] = useActionState(addUnionMember.bind(null, unionId), undefined);
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={tu('employeeCode')} error={issueFor(state, 'employeeCode')}>
          <input name="employeeCode" required maxLength={40} className={inputClass} />
        </Field>
        <Field label={tu('role')}>
          <select name="role" defaultValue="member" className={inputClass}>
            {UNION_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`unionRoles.${r}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tu('joinedOn')} error={issueFor(state, 'joinedOn')}>
          <input type="date" name="joinedOn" required defaultValue={today} className={inputClass} />
        </Field>
        <Field label={tu('consentOn')} error={issueFor(state, 'checkOffConsentOn')}>
          <input type="date" name="checkOffConsentOn" className={inputClass} />
        </Field>
      </div>
      <p className="text-xs text-slate-500">{tu('consentHint')}</p>
      <SubmitButton>{tu('add')}</SubmitButton>
    </Form>
  );
}

/** Many members at once, from employee codes; those who cannot join are listed with why. */
export function BulkMembersForm({ unionId, today }: { unionId: string; today: string }) {
  const t = useTranslations('relations.union');
  const [state, action] = useActionState(addUnionMembers.bind(null, unionId), undefined);
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      {state?.result && (
        <Banner tone={state.result.skipped.length ? 'amber' : 'green'}>
          <p>{t('bulkResult', { added: state.result.added })}</p>
          {state.result.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {state.result.skipped.map((s) => (
                <li key={s.code}>
                  {t('skipped', { code: s.code, reason: t(`skipReasons.${s.reason}`) })}
                </li>
              ))}
            </ul>
          )}
        </Banner>
      )}
      <Field label={t('bulkCodes')} hint={t('bulkHint')} error={issueFor(state, 'employeeCodes')}>
        <textarea name="employeeCodes" required rows={4} className={`${inputClass} font-mono`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('joinedOn')} error={issueFor(state, 'joinedOn')}>
          <input type="date" name="joinedOn" required defaultValue={today} className={inputClass} />
        </Field>
        <Field label={t('consentOn')} hint={t('consentHint')}>
          <input type="date" name="checkOffConsentOn" className={inputClass} />
        </Field>
      </div>
      <SubmitButton>{t('bulkAdd')}</SubmitButton>
    </Form>
  );
}

/** When the member consented to check-off in writing; clearing it means they pay directly. */
export function ConsentForm({ unionId, member }: { unionId: string; member: UnionMemberView }) {
  const t = useTranslations('relations');
  const [state, action] = useActionState(setUnionConsent.bind(null, unionId, member.id), undefined);
  return (
    <Form state={state} action={action} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`consent-${member.id}`}>
        {t('union.consentOn')}
      </label>
      <input
        id={`consent-${member.id}`}
        type="date"
        name="checkOffConsentOn"
        defaultValue={member.checkOffConsentOn ?? ''}
        className={`${inputClass} w-40 py-1`}
      />
      <SubmitButton variant="secondary">{t('save')}</SubmitButton>
      {state?.error && (
        <span className="text-xs text-red-600">
          <ErrorText state={state} />
        </span>
      )}
    </Form>
  );
}

export function EndUnionMemberForm({
  unionId,
  memberId,
  today,
}: {
  unionId: string;
  memberId: string;
  today: string;
}) {
  const t = useTranslations('relations.union');
  const [state, action] = useActionState(endUnionMember.bind(null, unionId, memberId), undefined);
  return (
    <Form state={state} action={action} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`left-${memberId}`}>
        {t('leftOn')}
      </label>
      <input
        id={`left-${memberId}`}
        type="date"
        name="leftOn"
        required
        defaultValue={today}
        className={`${inputClass} w-40 py-1`}
      />
      <SubmitButton variant="secondary">{t('leave')}</SubmitButton>
      {state?.error && (
        <span className="text-xs text-red-600">
          <ErrorText state={state} />
        </span>
      )}
    </Form>
  );
}
