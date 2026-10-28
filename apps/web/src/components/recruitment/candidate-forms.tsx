'use client';

import type { CandidateDetail } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import type { ActionState } from '@/app/actions/platform';
import { eraseCandidate, updateCandidate } from '@/app/actions/applications';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

/** A candidate's details as HR keeps them: corrected contact details, notes, talent pool. */
export function CandidateEditForm({ candidate }: { candidate: CandidateDetail }) {
  const t = useTranslations('pipeline.candidate');
  const add = useTranslations('pipeline.add');
  const languages = useTranslations('pipeline.languages');
  const [state, action] = useActionState<ActionState<CandidateDetail>, FormData>(
    updateCandidate.bind(null, candidate.id),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-4">
      {state?.error && !state.issues?.length && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={add('fullName')} error={issueFor(state, 'fullName')}>
          <input
            name="fullName"
            required
            maxLength={120}
            defaultValue={candidate.fullName}
            className={inputClass}
          />
        </Field>
        <Field label={t('language')} error={issueFor(state, 'language')}>
          <select name="language" defaultValue={candidate.language} className={inputClass}>
            <option value="bn">{languages('bn')}</option>
            <option value="en">{languages('en')}</option>
          </select>
        </Field>
        <Field label={add('email')} error={issueFor(state, 'email')}>
          <input
            name="email"
            type="email"
            maxLength={200}
            defaultValue={candidate.email ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={add('phone')} hint={add('phoneHint')} error={issueFor(state, 'phone')}>
          <input
            name="phone"
            type="tel"
            defaultValue={candidate.phone?.replace(/^\+88/, '') ?? ''}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label={t('notes')} error={issueFor(state, 'notes')}>
        <textarea
          name="notes"
          rows={3}
          maxLength={4000}
          defaultValue={candidate.notes ?? ''}
          className={inputClass}
        />
      </Field>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="talentPool"
          defaultChecked={candidate.talentPool}
          className="mt-1"
        />
        {t('talentPool')}
      </label>
      <SubmitButton>{t('save')}</SubmitButton>
    </Form>
  );
}

/** Erasing a candidate at their request, after a second, explicit confirmation. */
export function EraseCandidate({ candidate }: { candidate: CandidateDetail }) {
  const t = useTranslations('pipeline.candidate.erase');
  const [asking, setAsking] = useState(false);
  const [state, setState] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-sm font-medium text-red-700 hover:underline"
      >
        {t('start')}
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-lg bg-red-50 p-4 ring-1 ring-red-200">
      {state?.error && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      <p className="text-sm font-medium text-red-800">{t('sure', { name: candidate.fullName })}</p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setState(await eraseCandidate(candidate.id)))}
          className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? '…' : t('confirm')}
        </button>
        <button type="button" onClick={() => setAsking(false)} className={buttonClass.secondary}>
          {t('keep')}
        </button>
      </div>
    </div>
  );
}
