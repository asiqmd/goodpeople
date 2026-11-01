'use client';

import { RATINGS, type EmployeeRef, type ReviewAnswersView, type ReviewDetail } from '@gp/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/app/actions/platform';
import {
  acknowledgeReview,
  proposePeers,
  saveManagerReview,
  saveSelfReview,
} from '@/app/actions/reviews';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

export function Refused({ state }: { state: ActionState<unknown> }) {
  if (!state?.error) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

/** A choice of 1 to 5, each with its words, so a rating never rests on a number alone. */
export function RatingChoice({
  name,
  legend,
  defaultValue,
  required,
  error,
}: {
  name: string;
  legend: string;
  defaultValue?: number | null;
  required?: boolean;
  error?: string;
}) {
  const t = useTranslations('reviews.ratings');
  const format = useFormatter();
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-800">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {RATINGS.map((n) => (
          <label
            key={n}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 has-[:checked]:bg-brand-50 has-[:checked]:font-medium has-[:checked]:ring-brand-600 has-[:focus-visible]:ring-2"
          >
            <input
              type="radio"
              name={name}
              value={n}
              required={required}
              defaultChecked={defaultValue === n}
              className="sr-only"
            />
            <span className="tabular-nums">{format.number(n)}</span>
            <span className="text-slate-600">{t(String(n) as '1')}</span>
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </fieldset>
  );
}

function IntentButtons({ submitLabel }: { submitLabel: string }) {
  const t = useTranslations('reviews.form');
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="submit"
        name="intent"
        value="save"
        disabled={pending}
        className={buttonClass.secondary}
      >
        {t('saveDraft')}
      </button>
      <button
        type="submit"
        name="intent"
        value="submit"
        disabled={pending}
        className={buttonClass.primary}
      >
        {pending ? '…' : submitLabel}
      </button>
    </div>
  );
}

/** The ratings and comments for the review's goals and the cycle's competencies. */
function RatingFields({
  review,
  answers,
  state,
}: {
  review: ReviewDetail;
  answers: ReviewAnswersView | null;
  state: ActionState<unknown>;
}) {
  const t = useTranslations('reviews.form');
  const locale = useLocale();
  const items = [
    ...review.goals.map((g) => ({
      group: 'goals',
      key: g.id,
      label: g.title,
      saved: answers?.goals[g.id],
    })),
    ...review.cycle.competencies.map((c) => ({
      group: 'competencies',
      key: c.key,
      label: locale === 'bn' ? c.bn : c.en,
      saved: answers?.competencies[c.key],
    })),
  ];
  return (
    <div className="space-y-5">
      {review.goals.length > 0 && <h3 className="text-sm font-semibold">{t('goals')}</h3>}
      {items.map((item, i) => (
        <div key={`${item.group}.${item.key}`} className="space-y-2">
          {i === review.goals.length && (
            <h3 className="pt-2 text-sm font-semibold">{t('competencies')}</h3>
          )}
          <RatingChoice
            name={`${item.group}.${item.key}.rating`}
            legend={item.label}
            defaultValue={item.saved?.rating}
            error={issueFor(state, `answers.${item.group}.${item.key}.rating`)}
          />
          <textarea
            name={`${item.group}.${item.key}.comment`}
            rows={2}
            maxLength={2000}
            defaultValue={item.saved?.comment ?? ''}
            placeholder={t('comment')}
            aria-label={`${item.label}: ${t('comment')}`}
            className={inputClass}
          />
        </div>
      ))}
      <Field label={t('overall')} error={issueFor(state, 'answers.overall')}>
        <textarea
          name="overall"
          rows={4}
          maxLength={4000}
          defaultValue={answers?.overall ?? ''}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

/** The person's own ratings and comments: a draft until they submit it to their manager. */
export function SelfReviewForm({ review }: { review: ReviewDetail }) {
  const t = useTranslations('reviews.form');
  const [state, action] = useActionState<ActionState<ReviewDetail>, FormData>(
    saveSelfReview.bind(null, review.id),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-5">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <p className="text-sm text-slate-600">{t('selfIntro')}</p>
      <RatingFields review={review} answers={review.self?.answers ?? null} state={state} />
      <IntentButtons submitLabel={t('submitSelf')} />
    </Form>
  );
}

/** The manager's ratings, comments, proposed rating and recommendations. */
export function ManagerReviewForm({ review }: { review: ReviewDetail }) {
  const t = useTranslations('reviews.form');
  const [state, action] = useActionState<ActionState<ReviewDetail>, FormData>(
    saveManagerReview.bind(null, review.id),
    undefined,
  );
  const mine = review.managerReview;
  const recommended = mine?.recommendations;
  return (
    <Form state={state} action={action} className="space-y-5">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <RatingFields review={review} answers={mine?.answers ?? null} state={state} />
      <div className="space-y-4 rounded-lg bg-slate-50 p-4">
        <RatingChoice
          name="proposedRating"
          legend={t('proposedRating')}
          defaultValue={mine?.proposedRating}
          error={issueFor(state, 'proposedRating')}
        />
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium text-slate-800">{t('recommendations')}</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="increment" defaultChecked={recommended?.increment} />
            {t('increment')}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="plan" defaultChecked={recommended?.plan} />
            {t('plan')}
          </label>
          <Field
            label={t('promotion')}
            error={issueFor(state, 'recommendations.promotionDesignationId')}
          >
            <select
              name="promotionDesignationId"
              defaultValue={recommended?.promotion?.id ?? ''}
              className={inputClass}
            >
              <option value="">{t('noPromotion')}</option>
              {review.promotionChoices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </fieldset>
      </div>
      <p className="text-xs text-slate-500">{t('managerSubmitHint')}</p>
      <IntentButtons submitLabel={t('submitManager')} />
    </Form>
  );
}

/** The person has read their released review: whether they agree, and why. */
export function AcknowledgeForm({ reviewId }: { reviewId: string }) {
  const t = useTranslations('reviews.acknowledge');
  const [state, action] = useActionState<ActionState<ReviewDetail>, FormData>(
    acknowledgeReview.bind(null, reviewId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-4">
      <Refused state={state} />
      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium text-slate-800">{t('question')}</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="agrees" value="yes" required defaultChecked />
          {t('agree')}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="agrees" value="no" />
          {t('disagree')}
        </label>
      </fieldset>
      <Field label={t('comment')} hint={t('commentHint')} error={issueFor(state, 'comment')}>
        <textarea name="comment" rows={3} maxLength={2000} className={inputClass} />
      </Field>
      <SubmitButton>{t('submit')}</SubmitButton>
    </Form>
  );
}

/** Names colleagues to give feedback: the manager approves the person's choices. */
export function PeerProposeForm({
  reviewId,
  choices,
  byManager,
}: {
  reviewId: string;
  choices: EmployeeRef[];
  byManager: boolean;
}) {
  const t = useTranslations('reviews.peers');
  const locale = useLocale();
  const [state, action] = useActionState<ActionState<ReviewDetail>, FormData>(
    proposePeers.bind(null, reviewId),
    undefined,
  );
  if (choices.length === 0) return <p className="text-sm text-slate-500">{t('noChoices')}</p>;
  return (
    <Form state={state} action={action} className="space-y-3">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{byManager ? t('asked') : t('named')}</Banner>}
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {choices.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="employeeIds" value={c.id} />
              {locale === 'bn' && c.fullNameBn ? c.fullNameBn : c.fullName}
              <span className="text-xs text-slate-500">{c.employeeCode}</span>
            </label>
          </li>
        ))}
      </ul>
      <SubmitButton variant="secondary">{byManager ? t('ask') : t('name')}</SubmitButton>
    </Form>
  );
}
