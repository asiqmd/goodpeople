'use client';

import {
  addDays,
  PLAN_LENGTHS,
  PLAN_OBJECTIVES_MAX,
  PLAN_OUTCOMES,
  type PlanObjective,
  type PlanView,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { createPlan, deletePlan, planStep, startPlan, updatePlan } from '@/app/actions/development';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

function Refused({ state }: { state: ActionState<unknown> }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

const textareaClass = `${inputClass} min-h-24`;

/**
 * A plan's content: why, from and to (30, 60 or 90 days, or any end after the start), what
 * must improve and how it is measured, the support given, and the review that recommended it.
 */
export function PlanForm({
  employeeId,
  plan,
  reviews,
  reviewId,
  today,
  onDone,
}: {
  /** For a new plan. */
  employeeId?: string;
  /** For a draft being changed. */
  plan?: PlanView;
  /** The person's reviews, to say which one recommended the plan. */
  reviews: { id: string; label: string }[];
  reviewId?: string;
  today: string;
  onDone?: () => void;
}) {
  const t = useTranslations('development.planForm');
  const [state, action] = useActionState<ActionState<PlanView>, FormData>(
    async (previous: ActionState<PlanView>, form: FormData) => {
      const result = plan
        ? await updatePlan(plan.id, previous, form)
        : await createPlan(previous, form);
      if (result?.ok) onDone?.();
      return result;
    },
    undefined,
  );
  const [startsOn, setStartsOn] = useState(plan?.startsOn ?? today);
  const [endsOn, setEndsOn] = useState(plan?.endsOn ?? addDays(today, 30));
  const [objectives, setObjectives] = useState<(PlanObjective & { key: number })[]>(
    (plan?.objectives.length ? plan.objectives : [{ text: '', measure: '' }]).map((o, key) => ({
      ...o,
      key,
    })),
  );
  const [next, setNext] = useState(objectives.length);
  const lengthOf = (days: number) => addDays(startsOn, days) === endsOn;

  return (
    <Form state={state} action={action} className="space-y-5">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
      <Field label={t('reason')} hint={t('reasonHint')} error={issueFor(state, 'reason')}>
        <textarea
          name="reason"
          required
          minLength={10}
          maxLength={2000}
          defaultValue={plan?.reason}
          className={textareaClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('startsOn')} error={issueFor(state, 'startsOn')}>
          <input
            type="date"
            name="startsOn"
            required
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={t('endsOn')} error={issueFor(state, 'endsOn')}>
          <input
            type="date"
            name="endsOn"
            required
            min={addDays(startsOn, 1)}
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="text-sm">
          <span className="font-medium text-slate-800">{t('length')}</span>
          <span className="mt-1 flex gap-2" role="group" aria-label={t('length')}>
            {PLAN_LENGTHS.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={lengthOf(days)}
                onClick={() => setEndsOn(addDays(startsOn, days))}
                className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset ${
                  lengthOf(days)
                    ? 'bg-brand-50 text-brand-700 ring-brand-600'
                    : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {t('days', { days })}
              </button>
            ))}
          </span>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-800">{t('objectives')}</legend>
        <p className="text-xs text-slate-500">{t('objectivesHint')}</p>
        {issueFor(state, 'objectives') && (
          <p className="text-xs text-red-600">{issueFor(state, 'objectives')}</p>
        )}
        {objectives.map((o, i) => (
          <div
            key={o.key}
            className="grid gap-3 rounded-lg p-3 ring-1 ring-slate-200 sm:grid-cols-2"
          >
            <Field
              label={t('objective', { n: i + 1 })}
              error={issueFor(state, `objectives.${i}.text`)}
            >
              <input
                name={`objectives.${i}.text`}
                required
                maxLength={500}
                defaultValue={o.text}
                className={inputClass}
              />
            </Field>
            <Field label={t('measure')} error={issueFor(state, `objectives.${i}.measure`)}>
              <input
                name={`objectives.${i}.measure`}
                required
                maxLength={500}
                defaultValue={o.measure}
                className={inputClass}
              />
            </Field>
            {objectives.length > 1 && (
              <button
                type="button"
                onClick={() => setObjectives(objectives.filter((x) => x.key !== o.key))}
                className={`${buttonClass.ghost} justify-self-start`}
              >
                {t('removeObjective')}
              </button>
            )}
          </div>
        ))}
        {objectives.length < PLAN_OBJECTIVES_MAX && (
          <button
            type="button"
            onClick={() => {
              setObjectives([...objectives, { text: '', measure: '', key: next }]);
              setNext(next + 1);
            }}
            className={buttonClass.secondary}
          >
            {t('addObjective')}
          </button>
        )}
      </fieldset>

      <Field label={t('support')} hint={t('supportHint')} error={issueFor(state, 'support')}>
        <textarea
          name="support"
          maxLength={2000}
          defaultValue={plan?.support ?? ''}
          className={textareaClass}
        />
      </Field>

      {reviews.length > 0 && (
        <Field label={t('review')} hint={t('reviewHint')} error={issueFor(state, 'reviewId')}>
          <select
            name="reviewId"
            defaultValue={plan?.review?.id ?? reviewId ?? ''}
            className={inputClass}
          >
            <option value="">{t('noReview')}</option>
            {reviews.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <SubmitButton>{plan ? t('save') : t('create')}</SubmitButton>
    </Form>
  );
}

/** Changing a draft, folded away until wanted. */
export function PlanEditor({
  plan,
  reviews,
  today,
}: {
  plan: PlanView;
  reviews: { id: string; label: string }[];
  today: string;
}) {
  const t = useTranslations('development.planForm');
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="space-y-3">
      <PlanForm plan={plan} reviews={reviews} today={today} onDone={() => setOpen(false)} />
      <button type="button" onClick={() => setOpen(false)} className={buttonClass.ghost}>
        {t('cancel')}
      </button>
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className={buttonClass.secondary}>
      {t('edit')}
    </button>
  );
}

/** Start (the person is told) or delete a draft, each asking first. */
export function PlanDraftButtons({ planId }: { planId: string }) {
  const t = useTranslations('development.plan');
  const [started, start] = useActionState<ActionState, FormData>(
    () => startPlan(planId),
    undefined,
  );
  const [deleted, remove] = useActionState<ActionState, FormData>(
    () => deletePlan(planId),
    undefined,
  );
  return (
    <div className="space-y-3">
      <Refused state={started} />
      <Refused state={deleted} />
      <div className="flex flex-wrap gap-3">
        <Form
          state={started}
          action={start}
          onSubmit={(event) => {
            if (!window.confirm(t('startConfirm'))) event.preventDefault();
          }}
        >
          <SubmitButton>{t('start')}</SubmitButton>
        </Form>
        <Form
          state={deleted}
          action={remove}
          onSubmit={(event) => {
            if (!window.confirm(t('deleteConfirm'))) event.preventDefault();
          }}
        >
          <SubmitButton variant="secondary">{t('delete')}</SubmitButton>
        </Form>
      </div>
    </div>
  );
}

function useStep(planId: string, step: 'checkins' | 'extend' | 'close' | 'acknowledge') {
  return useActionState<ActionState<PlanView>, FormData>(
    planStep.bind(null, planId, step),
    undefined,
  );
}

export function PlanCheckinForm({
  planId,
  startsOn,
  today,
}: {
  planId: string;
  startsOn: string;
  today: string;
}) {
  const t = useTranslations('development.plan');
  const [state, action] = useStep(planId, 'checkins');
  return (
    <Form key={state?.ok ? 'saved' : 'checkin'} state={state} action={action} className="space-y-3">
      <Refused state={state} />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label={t('heldOn')} error={issueFor(state, 'heldOn')}>
          <input
            type="date"
            name="heldOn"
            required
            min={startsOn}
            max={today}
            defaultValue={today}
            className={inputClass}
          />
        </Field>
        <Field label={t('checkinNote')} error={issueFor(state, 'note')}>
          <textarea name="note" required minLength={3} maxLength={2000} className={inputClass} />
        </Field>
      </div>
      <SubmitButton>{t('addCheckin')}</SubmitButton>
    </Form>
  );
}

export function PlanExtendForm({ planId, endsOn }: { planId: string; endsOn: string }) {
  const t = useTranslations('development.plan');
  const [state, action] = useStep(planId, 'extend');
  return (
    <Form state={state} action={action} className="space-y-3">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('extended')}</Banner>}
      <Field label={t('newEnd')} error={issueFor(state, 'endsOn')}>
        <input
          type="date"
          name="endsOn"
          required
          min={addDays(endsOn, 1)}
          defaultValue={addDays(endsOn, 30)}
          className={inputClass}
        />
      </Field>
      <Field label={t('extendReason')} error={issueFor(state, 'reason')}>
        <textarea name="reason" required minLength={3} maxLength={1000} className={inputClass} />
      </Field>
      <SubmitButton variant="secondary">{t('extend')}</SubmitButton>
    </Form>
  );
}

/** Closing with not met is a record: the form says so before it is sent. */
export function PlanCloseForm({ planId }: { planId: string }) {
  const t = useTranslations('development.plan');
  const outcomes = useTranslations('development.plans.statuses');
  const [state, action] = useStep(planId, 'close');
  return (
    <Form
      state={state}
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(t('closeConfirm'))) event.preventDefault();
      }}
      className="space-y-3"
    >
      <Refused state={state} />
      <Field label={t('outcome')} hint={t('outcomeHint')} error={issueFor(state, 'outcome')}>
        <select name="outcome" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            {t('chooseOutcome')}
          </option>
          {PLAN_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {outcomes(o)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('outcomeNote')} error={issueFor(state, 'note')}>
        <textarea name="note" required minLength={3} maxLength={2000} className={inputClass} />
      </Field>
      <SubmitButton>{t('close')}</SubmitButton>
    </Form>
  );
}

/** The person has read it; what they write is theirs, agreeing or not. */
export function PlanAcknowledgeForm({ planId }: { planId: string }) {
  const t = useTranslations('development.plan');
  const [state, action] = useStep(planId, 'acknowledge');
  return (
    <Form state={state} action={action} className="space-y-3">
      <Refused state={state} />
      <Field
        label={t('yourComment')}
        hint={t('yourCommentHint')}
        error={issueFor(state, 'comment')}
      >
        <textarea name="comment" maxLength={2000} className={textareaClass} />
      </Field>
      <SubmitButton>{t('acknowledge')}</SubmitButton>
    </Form>
  );
}
