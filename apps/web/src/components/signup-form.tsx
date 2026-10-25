'use client';

import { INDUSTRY_TEMPLATES, type SlugCheck } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState } from 'react';
import { checkSlug, startSignup, verifySignup, type SignupState } from '@/app/actions/signup';
import { ErrorText, Form, issueFor, SubmitButton } from './forms';
import { Banner, Field, inputClass } from './ui';

function Errors({ state }: { state: SignupState }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

/** Sign-up in two steps: who you are (a code is emailed), then the code, an address and a password. */
export function SignupForm() {
  const t = useTranslations('signup');
  const ti = useTranslations('industries');
  const [started, start] = useActionState(startSignup, undefined);
  const [verified, verify] = useActionState(verifySignup, undefined);
  const state = verified?.step === 'verify' ? verified : started;

  if (state?.step !== 'verify') {
    return (
      <Form state={started} action={start} className="space-y-4">
        <Errors state={started} />
        <Field label={t('name')} error={issueFor(started, 'name')}>
          <input name="name" required autoComplete="name" className={inputClass} />
        </Field>
        <Field label={t('email')} error={issueFor(started, 'email')}>
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </Field>
        <Field label={t('company')} error={issueFor(started, 'company')}>
          <input name="company" required autoComplete="organization" className={inputClass} />
        </Field>
        <Field label={t('industry')}>
          <select name="industryTemplate" required defaultValue="rmg" className={inputClass}>
            {INDUSTRY_TEMPLATES.map((i) => (
              <option key={i} value={i}>
                {ti(i)}
              </option>
            ))}
          </select>
        </Field>
        {/* People never see or fill this; simple bots do. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <SubmitButton>{t('sendCode')}</SubmitButton>
        <p className="text-xs text-slate-500">{t('trialNote')}</p>
      </Form>
    );
  }
  return <VerifyStep state={state} action={verify} />;
}

function VerifyStep({
  state,
  action,
}: {
  state: NonNullable<SignupState>;
  action: (form: FormData) => void;
}) {
  const t = useTranslations('signup');
  const [slug, setSlug] = useState(state.slug ?? '');
  const [check, setCheck] = useState<SlugCheck | null>(null);
  useEffect(() => {
    if (slug.length < 3) return;
    const timer = setTimeout(() => void checkSlug(slug).then(setCheck), 350);
    return () => clearTimeout(timer);
  }, [slug]);
  const shown = check?.slug === slug ? check : null;
  return (
    <Form state={state} action={action} className="space-y-4">
      <input type="hidden" name="signupId" value={state.signupId ?? ''} />
      <input type="hidden" name="email" value={state.email ?? ''} />
      <Banner tone="green">{t('codeSent', { email: state.email ?? '' })}</Banner>
      <Errors state={state} />
      <Field label={t('code')} error={issueFor(state, 'code')}>
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="\d{6}"
          className={`${inputClass} tracking-[0.3em]`}
        />
      </Field>
      <Field label={t('slug')} hint={t('slugHint')} error={issueFor(state, 'slug')}>
        <input
          name="slug"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          autoComplete="off"
          className={inputClass}
        />
      </Field>
      {shown && (
        <p className={`-mt-2 text-sm ${shown.available ? 'text-green-700' : 'text-amber-700'}`}>
          {shown.available ? t('slugFree') : t('slugTaken')}{' '}
          {!shown.available && shown.suggestion && (
            <button
              type="button"
              onClick={() => setSlug(shown.suggestion!)}
              className="font-medium text-brand-700 underline"
            >
              {t('useSuggestion', { slug: shown.suggestion })}
            </button>
          )}
        </p>
      )}
      <Field label={t('password')} hint={t('passwordHint')} error={issueFor(state, 'password')}>
        <input
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>
      <SubmitButton>{t('create')}</SubmitButton>
      <p className="text-xs text-slate-500">
        {t('noCode')} {/* A fresh page: the first step again, with nothing kept from this one. */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-medium text-brand-700 underline"
        >
          {t('startAgain')}
        </button>
      </p>
    </Form>
  );
}
