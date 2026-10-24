'use client';

import type { HalfDay, LeavePreview, LeaveRequestView, LeaveTypeView } from '@gp/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { applyLeave, cancelLeave, decideApproval, previewLeave } from '@/app/actions/leave';
import type { ActionState } from '@/app/actions/platform';
import { SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

const typeName = (t: { name: string; nameBn: string | null }, locale: string) =>
  locale === 'bn' && t.nameBn ? t.nameBn : t.name;

/**
 * Apply for leave. The day count, skipped days and any reason the request would be refused
 * come from the API's preview as the dates change, so the form never guesses the rules.
 */
export function ApplyLeaveForm({ types }: { types: LeaveTypeView[] }) {
  const t = useTranslations('leave.form');
  const [state, action] = useActionState<ActionState<LeaveRequestView>, FormData>(
    applyLeave,
    undefined,
  );
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.result && <Banner tone="green">{t('submitted')}</Banner>}
      {/* A new key after each submitted request starts the fields afresh. */}
      <ApplyFields key={state?.result?.id ?? 'new'} types={types} />
    </form>
  );
}

function ApplyFields({ types }: { types: LeaveTypeView[] }) {
  const t = useTranslations('leave.form');
  const locale = useLocale();
  const format = useFormatter();
  const [typeId, setTypeId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [halfDay, setHalfDay] = useState<HalfDay | ''>('');
  const [fetched, setFetched] = useState<{ key: string; preview: LeavePreview } | null>(null);
  const [, startPreview] = useTransition();
  const type = types.find((x) => x.id === typeId);
  const singleDay = start !== '' && start === end;
  const effectiveHalfDay = singleDay && halfDay ? halfDay : null;
  const ready = typeId !== '' && start !== '' && end !== '' && end >= start;
  // Only a preview for exactly these inputs counts; anything older is ignored.
  const key = `${typeId}|${start}|${end}|${effectiveHalfDay}`;
  const preview = ready && fetched?.key === key ? fetched.preview : null;

  useEffect(() => {
    if (!ready) return;
    startPreview(async () => {
      const result = await previewLeave({
        leaveTypeId: typeId,
        startDate: start,
        endDate: end,
        halfDay: effectiveHalfDay,
      });
      if (!('error' in result)) setFetched({ key, preview: result });
    });
  }, [ready, key, typeId, start, end, effectiveHalfDay]);

  const date = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  const blocked = !preview || preview.problems.length > 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('type')}>
          <select
            name="leaveTypeId"
            required
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className={inputClass}
          >
            <option value="">{t('choose')}</option>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {typeName(x, locale)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('start')}>
          <input
            name="startDate"
            type="date"
            required
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (!end || end < e.target.value) setEnd(e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <Field label={t('end')}>
          <input
            name="endDate"
            type="date"
            required
            min={start}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      {type?.allowHalfDay && singleDay && (
        <fieldset className="flex flex-wrap gap-4 text-sm">
          {(['', 'first_half', 'second_half'] as const).map((value) => (
            <label key={value || 'full'} className="flex items-center gap-2">
              <input
                type="radio"
                name="halfDay"
                value={value}
                checked={halfDay === value}
                onChange={() => setHalfDay(value)}
              />
              {value ? t(value) : t('fullDay')}
            </label>
          ))}
        </fieldset>
      )}
      <Field label={t('reason')}>
        <input name="reason" required minLength={3} maxLength={500} className={inputClass} />
      </Field>

      {preview && (
        <div className="rounded-lg bg-slate-50 p-4 text-sm ring-1 ring-slate-200">
          <p className="font-medium">{t('preview', { days: preview.days })}</p>
          {preview.excluded.length > 0 && (
            <ul className="mt-1 text-xs text-slate-500">
              {preview.excluded.map((x) => (
                <li key={x.date}>
                  {x.reason === 'holiday'
                    ? t('holiday', { date: date(x.date), name: x.name ?? '' })
                    : t('weekly_off', { date: date(x.date) })}
                </li>
              ))}
            </ul>
          )}
          {preview.problems.map((p) => (
            <p key={p} className="mt-1 text-red-600">
              {p}
            </p>
          ))}
        </div>
      )}
      <div aria-disabled={blocked} className={blocked ? 'pointer-events-none opacity-50' : ''}>
        <SubmitButton>{t('submit')}</SubmitButton>
      </div>
    </>
  );
}

export function CancelLeaveButton({ requestId }: { requestId: string }) {
  const t = useTranslations('leave.request');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass.ghost}
      onClick={() => {
        if (window.confirm(t('cancelConfirm'))) start(() => cancelLeave(requestId));
      }}
    >
      {t('cancel')}
    </button>
  );
}

/** Approve or reject one step, with an optional comment. */
export function DecisionForm({ stepId }: { stepId: string }) {
  const t = useTranslations('leave.approvals');
  const [approveState, approve] = useActionState<ActionState, FormData>(
    decideApproval.bind(null, stepId, 'approve'),
    undefined,
  );
  const [rejectState, reject] = useActionState<ActionState, FormData>(
    decideApproval.bind(null, stepId, 'reject'),
    undefined,
  );
  const error = approveState?.error ?? rejectState?.error;
  return (
    <form className="space-y-2">
      {error && <Banner tone="red">{error}</Banner>}
      <input name="comment" maxLength={500} placeholder={t('comment')} className={inputClass} />
      <div className="flex gap-2">
        <button formAction={approve} className={buttonClass.primary}>
          {t('approve')}
        </button>
        <button formAction={reject} className={buttonClass.secondary}>
          {t('reject')}
        </button>
      </div>
    </form>
  );
}
