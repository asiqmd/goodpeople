'use client';

import type { CareersApplied } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { applyForJob } from '@/app/actions/careers';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';

/**
 * Applying for a job: who they are, a CV and a note, and their explicit consent, which names
 * the company, how long the application is kept and whom to ask about it.
 */
export function CareersApplyForm({
  slug,
  openingId,
  company,
  retentionMonths,
  privacyEmail,
}: {
  slug: string;
  openingId: string;
  company: string;
  retentionMonths: number;
  privacyEmail: string | null;
}) {
  const t = useTranslations('careers.apply');
  const [state, action] = useActionState<ActionState<CareersApplied>, FormData>(
    applyForJob.bind(null, slug, openingId),
    undefined,
  );
  if (state?.ok) {
    return (
      <div role="status" className="space-y-2 rounded-xl bg-brand-50 p-5 text-brand-900">
        <p className="text-lg font-semibold">{t('thanks')}</p>
        <p className="text-sm">{t('thanksDetail', { company })}</p>
      </div>
    );
  }
  return (
    <Form state={state} action={action} className="space-y-4">
      {state?.error && !state.issues?.length && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('fullName')} error={issueFor(state, 'fullName')}>
          <input
            name="fullName"
            required
            maxLength={120}
            autoComplete="name"
            className={inputClass}
          />
        </Field>
        <Field label={t('phone')} hint={t('phoneHint')} error={issueFor(state, 'phone')}>
          <input
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            className={inputClass}
          />
        </Field>
        <Field label={t('email')} error={issueFor(state, 'email')}>
          <input
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            className={inputClass}
          />
        </Field>
        <Field label={t('cv')} hint={t('cvHint')}>
          <input
            name="cv"
            type="file"
            required
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
          />
        </Field>
      </div>
      <Field label={t('coverNote')} hint={t('coverNoteHint')} error={issueFor(state, 'coverNote')}>
        <textarea name="coverNote" rows={4} maxLength={3000} className={inputClass} />
      </Field>
      {/* Left empty by people; simple bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" value="true" required className="mt-1" />
        <span>
          {t('consent', { company, months: retentionMonths })}{' '}
          {privacyEmail
            ? t('consentContact', { email: privacyEmail })
            : t('consentCompany', { company })}
          {issueFor(state, 'consent') && (
            <span className="mt-1 block text-xs text-red-600">{issueFor(state, 'consent')}</span>
          )}
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="talentPool" value="true" className="mt-1" />
        <span>{t('talentPool', { company })}</span>
      </label>
      <SubmitButton>{t('submit')}</SubmitButton>
    </Form>
  );
}
