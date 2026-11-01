'use client';

import {
  PROBATION_RECOMMENDATIONS,
  RATINGS,
  type Competency,
  type ProbationReviewView,
} from '@gp/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { submitProbationReview } from '@/app/actions/development';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';

/**
 * The manager's probation review: each competency rated 1–5 (with its words), a comment, and
 * a recommendation to confirm, extend or end the probation. It is sent once; HR acts on it.
 */
export function ProbationReviewForm({
  reviewId,
  competencies,
}: {
  reviewId: string;
  competencies: Competency[];
}) {
  const t = useTranslations('development.probation');
  const words = useTranslations('development.ratings');
  const locale = useLocale();
  const [state, action] = useActionState<ActionState<ProbationReviewView>, FormData>(
    submitProbationReview.bind(null, reviewId),
    undefined,
  );
  return (
    <Form
      state={state}
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(t('submitConfirm'))) event.preventDefault();
      }}
      className="space-y-5"
    >
      {state?.error && !state.issues?.length && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-slate-800">{t('ratingsTitle')}</legend>
        {issueFor(state, 'ratings') && (
          <p className="text-xs text-red-600">{issueFor(state, 'ratings')}</p>
        )}
        {competencies.map((c) => (
          <fieldset key={c.key} className="rounded-lg p-3 ring-1 ring-slate-200">
            <legend className="px-1 text-sm font-medium text-slate-800">
              {locale === 'bn' ? c.bn : c.en}
            </legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
              {RATINGS.map((r) => (
                <label key={r} className="inline-flex items-center gap-2 text-sm">
                  <input type="radio" name={`ratings.${c.key}`} value={r} required />
                  <span>{t('ratingOption', { rating: r, words: words(String(r)) })}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">{t('recommendation')}</legend>
        {PROBATION_RECOMMENDATIONS.map((r) => (
          <label key={r} className="flex items-start gap-2 text-sm">
            <input type="radio" name="recommendation" value={r} required className="mt-1" />
            <span>
              <span className="font-medium">{t(`recommendations.${r}`)}</span>
              <span className="block text-xs text-slate-500">{t(`recommendationHints.${r}`)}</span>
            </span>
          </label>
        ))}
        {issueFor(state, 'recommendation') && (
          <p className="text-xs text-red-600">{issueFor(state, 'recommendation')}</p>
        )}
      </fieldset>

      <Field label={t('comment')} hint={t('commentHint')} error={issueFor(state, 'comment')}>
        <textarea name="comment" maxLength={2000} className={`${inputClass} min-h-24`} />
      </Field>
      <SubmitButton>{t('submit')}</SubmitButton>
    </Form>
  );
}
