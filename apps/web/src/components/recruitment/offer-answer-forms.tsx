'use client';

import type { PublicOfferView } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { answerOffer } from '@/app/actions/offers';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';

type State = ActionState<PublicOfferView>;

/** People never see or fill this; simple bots do. */
function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

function Refused({ state }: { state: State }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

/** The candidate accepts by typing their full name, or declines with a reason if they wish. */
export function OfferAnswerForms({ slug, token }: { slug: string; token: string }) {
  const t = useTranslations('offers.public');
  const [accepted, accept] = useActionState<State, FormData>(
    answerOffer.bind(null, slug, token, 'accept'),
    undefined,
  );
  const [declined, decline] = useActionState<State, FormData>(
    answerOffer.bind(null, slug, token, 'decline'),
    undefined,
  );
  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl bg-brand-50 p-5 ring-1 ring-inset ring-brand-600/20">
        <h2 className="text-lg font-semibold text-brand-900">{t('acceptTitle')}</h2>
        <Form state={accepted} action={accept} className="relative space-y-3">
          <Refused state={accepted} />
          <Honeypot />
          <Field label={t('name')} hint={t('nameHint')} error={issueFor(accepted, 'name')}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={160}
              autoComplete="name"
              className={`${inputClass} text-base`}
            />
          </Field>
          <SubmitButton>{t('accept')}</SubmitButton>
        </Form>
      </section>
      <details className="rounded-2xl bg-white ring-1 ring-slate-200">
        <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-slate-700">
          {t('declineTitle')}
        </summary>
        <Form
          state={declined}
          action={decline}
          onSubmit={(event) => {
            if (!window.confirm(t('declineConfirm'))) event.preventDefault();
          }}
          className="relative space-y-3 border-t border-slate-200 p-5"
        >
          <Refused state={declined} />
          <Honeypot />
          <Field label={t('reason')} error={issueFor(declined, 'reason')}>
            <textarea name="reason" rows={3} maxLength={1000} className={inputClass} />
          </Field>
          <SubmitButton variant="secondary">{t('decline')}</SubmitButton>
        </Form>
      </details>
    </div>
  );
}
