'use client';

import {
  INTERVIEW_KINDS,
  RECOMMENDATIONS,
  type InterviewView,
  type MyInterviewDetail,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import type { ActionState } from '@/app/actions/platform';
import {
  cancelInterview,
  completeInterview,
  findInterviewers,
  rescheduleInterview,
  scheduleInterview,
  submitScorecard,
} from '@/app/actions/interviews';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';
import { PeoplePicker } from './pipeline-forms';

/** "2026-10-29T10:00" in Dhaka (UTC+6 all year) for a moment. */
const dhakaLocal = (iso: string) =>
  new Date(Date.parse(iso) + 6 * 3_600_000).toISOString().slice(0, 16);

function Refused({ state }: { state: ActionState<unknown> }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

/** Schedules an interview, or changes one: everyone gets a calendar invitation either way. */
export function InterviewForm({
  applicationId,
  interview,
  onDone,
}: {
  applicationId: string;
  interview?: InterviewView;
  onDone?: () => void;
}) {
  const t = useTranslations('interviews.form');
  const kinds = useTranslations('interviews.kinds');
  const [kind, setKind] = useState<string>(interview?.kind ?? 'in_person');
  const [state, action] = useActionState<ActionState<InterviewView>, FormData>(
    async (previous: ActionState<InterviewView>, form: FormData) => {
      const result = interview
        ? await rescheduleInterview(interview.id, applicationId, previous, form)
        : await scheduleInterview(applicationId, previous, form);
      if (result?.ok) onDone?.();
      return result;
    },
    undefined,
  );
  const start = interview ? dhakaLocal(interview.startsAt) : '';
  const end = interview ? dhakaLocal(interview.endsAt) : '';
  return (
    <Form
      key={state?.ok ? state.result?.id : 'interview'}
      state={state}
      action={action}
      className="space-y-4"
    >
      <Refused state={state} />
      {state?.ok && !interview && <Banner tone="green">{t('scheduled')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t('kind')} error={issueFor(state, 'kind')}>
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={inputClass}
          >
            {INTERVIEW_KINDS.map((k) => (
              <option key={k} value={k}>
                {kinds(k)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('date')} hint={t('timeHint')} error={issueFor(state, 'date')}>
          <input
            type="date"
            name="date"
            required
            defaultValue={start.slice(0, 10)}
            className={inputClass}
          />
        </Field>
        <Field label={t('from')} error={issueFor(state, 'from')}>
          <input
            type="time"
            name="from"
            required
            defaultValue={start.slice(11)}
            className={inputClass}
          />
        </Field>
        <Field label={t('to')} error={issueFor(state, 'to')}>
          <input
            type="time"
            name="to"
            required
            defaultValue={end.slice(11)}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={kind === 'phone' ? t('phoneNote') : t('location')}
          error={issueFor(state, 'location')}
        >
          <input
            name="location"
            required={kind === 'in_person'}
            maxLength={300}
            defaultValue={interview?.location ?? ''}
            className={inputClass}
          />
        </Field>
        {kind === 'video' && (
          <Field label={t('meetingUrl')} error={issueFor(state, 'meetingUrl')}>
            <input
              name="meetingUrl"
              type="url"
              required
              placeholder="https://"
              defaultValue={interview?.meetingUrl ?? ''}
              className={inputClass}
            />
          </Field>
        )}
      </div>
      <div className="text-sm">
        <p className="font-medium text-slate-800">{t('interviewers')}</p>
        <p className="mb-2 text-xs text-slate-500">{t('interviewersHint')}</p>
        <PeoplePicker
          name="interviewerIds"
          multiple
          find={findInterviewers.bind(null, applicationId)}
          initial={interview?.panel.map((p) => p.employee)}
          error={issueFor(state, 'interviewerIds')}
        />
      </div>
      <Field label={t('notes')} error={issueFor(state, 'notes')}>
        <textarea
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={interview?.notes ?? ''}
          className={inputClass}
        />
      </Field>
      <SubmitButton>{interview ? t('update') : t('submit')}</SubmitButton>
    </Form>
  );
}

/** Changing, cancelling or completing a scheduled interview. */
export function InterviewActions({
  interview,
  applicationId,
  started,
}: {
  interview: InterviewView;
  applicationId: string;
  /** Whether it has begun, worked out on the server. */
  started: boolean;
}) {
  const t = useTranslations('interviews.panel');
  const [open, setOpen] = useState<'change' | 'cancel' | null>(null);
  const [state, cancel] = useActionState<ActionState, FormData>(
    cancelInterview.bind(null, interview.id, applicationId),
    undefined,
  );
  const [completed, setCompleted] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          onClick={() => setOpen(open === 'change' ? null : 'change')}
          className="font-medium text-brand-700 hover:underline"
        >
          {t('reschedule')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(open === 'cancel' ? null : 'cancel')}
          className="font-medium text-red-700 hover:underline"
        >
          {t('cancel')}
        </button>
        {started && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => setCompleted(await completeInterview(interview.id, applicationId)))
            }
            className="font-medium text-slate-700 hover:underline"
          >
            {pending ? '…' : t('complete')}
          </button>
        )}
      </div>
      <Refused state={completed} />
      {open === 'change' && (
        <InterviewForm
          applicationId={applicationId}
          interview={interview}
          onDone={() => setOpen(null)}
        />
      )}
      {open === 'cancel' && (
        <Form state={state} action={cancel} className="space-y-2">
          <Refused state={state} />
          <Field label={t('cancelReason')} error={issueFor(state, 'reason')}>
            <input name="reason" maxLength={500} className={inputClass} />
          </Field>
          <SubmitButton variant="secondary">{t('cancelConfirm')}</SubmitButton>
        </Form>
      )}
    </div>
  );
}

/** The interviewer's scorecard: 1 to 5 for each criterion, a recommendation and notes. */
export function ScorecardForm({ interview }: { interview: MyInterviewDetail }) {
  const t = useTranslations('interviews.scorecard');
  const recommendations = useTranslations('interviews.recommendations');
  const [state, action] = useActionState<ActionState<MyInterviewDetail>, FormData>(
    submitScorecard.bind(null, interview.id, interview.criteria),
    undefined,
  );
  const mine = interview.mine;
  return (
    <Form state={state} action={action} className="space-y-5">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <p className="text-sm text-slate-600">{t('intro')}</p>
      {interview.criteria.map((criterion, i) => (
        <fieldset key={criterion}>
          <legend className="text-sm font-medium text-slate-800">{criterion}</legend>
          <div className="mt-1 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className="flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 has-[:checked]:bg-brand-50 has-[:checked]:ring-brand-600 has-[:focus-visible]:ring-2"
              >
                <input
                  type="radio"
                  name={`rating.${i}`}
                  value={n}
                  required
                  defaultChecked={mine?.ratings[criterion] === n}
                  className="sr-only"
                />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend className="text-sm font-medium text-slate-800">{t('recommendation')}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {RECOMMENDATIONS.map((r) => (
            <label
              key={r}
              className="flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 has-[:checked]:bg-brand-50 has-[:checked]:ring-brand-600 has-[:focus-visible]:ring-2"
            >
              <input
                type="radio"
                name="recommendation"
                value={r}
                required
                defaultChecked={mine?.recommendation === r}
                className="sr-only"
              />
              {recommendations(r)}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={t('feedback')} hint={t('feedbackHint')} error={issueFor(state, 'feedback')}>
        <textarea
          name="feedback"
          rows={4}
          maxLength={4000}
          defaultValue={mine?.feedback ?? ''}
          className={inputClass}
        />
      </Field>
      <SubmitButton>{mine ? t('update') : t('submit')}</SubmitButton>
    </Form>
  );
}
