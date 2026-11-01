'use client';

import {
  isRecordSource,
  KPI_DIRECTIONS,
  KPI_SOURCES,
  MAX_KEY_RESULTS,
  type GoalCycleRef,
  type GoalDetail,
  type GoalKind,
  type GoalView,
  type KpiSource,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, useTransition } from 'react';
import {
  agreeAllGoals,
  checkinGoal,
  createGoal,
  dropGoal,
  moveGoal,
  submitGoals,
  updateGoal,
} from '@/app/actions/goals';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

/** A refusal: in a banner unless it belongs to one field. */
function Refused({ state }: { state: ActionState<unknown> }) {
  if (!state?.error) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

/** The API's message for a field, in the reader's language when its code is known. */
function useFieldError(state: ActionState<unknown>) {
  const t = useTranslations('errors');
  return (path: string) => {
    const message = issueFor(state, path);
    if (!message) return undefined;
    // A goal's own rule has its code; zod's field messages stay as they are.
    const code = state?.code;
    return code && code !== 'validation_failed' && t.has(code) ? t(code) : message;
  };
}

/** A stored decimal as typed: 95.00 → 95. */
const typed = (v: string | null | undefined) => (v ? String(Number(v)) : '');

/**
 * A goal's form, new or to edit: an objective with key results, or a KPI with its measure,
 * target and direction, typed in check-ins or read from the records. A person's goal has a
 * weight; a unit's has none.
 */
export function GoalForm({
  goal,
  owner,
  cycles,
  alignTo,
  defaults = {},
}: {
  goal?: GoalDetail;
  owner: { employeeId?: string; orgUnitId?: string };
  cycles: GoalCycleRef[];
  alignTo: GoalView[];
  defaults?: { cycleId?: string; parentGoalId?: string };
}) {
  const t = useTranslations('goals.form');
  const tg = useTranslations('goals');
  const router = useRouter();
  const [state, action] = useActionState<ActionState<GoalDetail>, FormData>(
    goal ? updateGoal.bind(null, goal.id) : createGoal,
    undefined,
  );
  const fieldError = useFieldError(state);
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? 'objective');
  const [source, setSource] = useState<KpiSource>(goal?.source ?? 'manual');
  const [keyResults, setKeyResults] = useState<string[]>(
    goal?.keyResults.length ? goal.keyResults.map((k) => k.text) : [''],
  );
  const weighted = !!(goal ? goal.employee : owner.employeeId);
  const fromRecords = kind === 'kpi' && isRecordSource(source);

  useEffect(() => {
    if (!goal && state?.ok && state.result) {
      router.push(`/workspace/performance/goals/${state.result.id}`);
    }
  }, [goal, router, state]);

  // The goal's own cycle and parent stay choosable even when no longer offered.
  const cycleChoices =
    goal?.cycle && !cycles.some((c) => c.id === goal.cycle!.id) ? [goal.cycle, ...cycles] : cycles;
  const parentChoices = [
    ...(goal?.parent && !alignTo.some((g) => g.id === goal.parent!.id) ? [goal.parent] : []),
    ...alignTo.map((g) => ({ id: g.id, title: g.title })),
  ];

  return (
    <Form state={state} action={action} className="space-y-4">
      {!state?.issues?.length && <Refused state={state} />}
      {goal && state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      {owner.employeeId && <input type="hidden" name="employeeId" value={owner.employeeId} />}
      {owner.orgUnitId && <input type="hidden" name="orgUnitId" value={owner.orgUnitId} />}

      <Field label={t('title')} error={fieldError('title')}>
        <input
          name="title"
          required
          minLength={3}
          maxLength={200}
          defaultValue={goal?.title}
          className={inputClass}
        />
      </Field>
      <Field label={t('description')} error={fieldError('description')}>
        <textarea
          name="description"
          rows={2}
          maxLength={2000}
          defaultValue={goal?.description ?? ''}
          className={inputClass}
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">{t('kind')}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(['objective', 'kpi'] as const).map((k) => (
            <label key={k} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              {tg(`kinds.${k}`)}
              <span className="text-slate-500">— {t(`kindHint.${k}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === 'objective' ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">{t('keyResults')}</legend>
          <p className="text-xs text-slate-500">{t('keyResultsHint')}</p>
          {keyResults.map((text, i) => (
            <div key={i} className="flex gap-2">
              <input
                name={`keyResults.${i}.text`}
                aria-label={t('keyResult', { n: i + 1 })}
                value={text}
                maxLength={300}
                onChange={(e) =>
                  setKeyResults(keyResults.map((k, j) => (j === i ? e.target.value : k)))
                }
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setKeyResults(keyResults.filter((_, j) => j !== i))}
                className={buttonClass.ghost}
              >
                {t('removeKeyResult')}
              </button>
            </div>
          ))}
          {fieldError('keyResults') && (
            <p className="text-xs text-red-600">{fieldError('keyResults')}</p>
          )}
          {keyResults.length < MAX_KEY_RESULTS && (
            <button
              type="button"
              onClick={() => setKeyResults([...keyResults, ''])}
              className={buttonClass.secondary}
            >
              {t('addKeyResult')}
            </button>
          )}
        </fieldset>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('source')} hint={t(`sourceHint.${source}`)} error={fieldError('source')}>
            <select
              name="source"
              value={source}
              onChange={(e) => setSource(e.target.value as KpiSource)}
              className={inputClass}
            >
              {KPI_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {tg(`sources.${s}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={fromRecords ? t('targetPercent') : t('target')}
            error={fieldError('target')}
          >
            <input
              name="target"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={typed(goal?.target)}
              className={inputClass}
            />
          </Field>
          {!fromRecords && (
            <>
              <Field
                label={t('measureUnit')}
                hint={t('measureUnitHint')}
                error={fieldError('measureUnit')}
              >
                <input
                  name="measureUnit"
                  required
                  maxLength={40}
                  defaultValue={goal?.measureUnit ?? ''}
                  className={inputClass}
                />
              </Field>
              <Field label={t('direction')} error={fieldError('direction')}>
                <select
                  name="direction"
                  required
                  defaultValue={goal?.direction ?? 'higher'}
                  className={inputClass}
                >
                  {KPI_DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {tg(`directions.${d}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cycle')} hint={t('cycleHint')} error={fieldError('cycleId')}>
          <select
            name="cycleId"
            defaultValue={goal ? (goal.cycle?.id ?? '') : (defaults.cycleId ?? '')}
            className={inputClass}
          >
            <option value="">{t('noCycle')}</option>
            {cycleChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {weighted && (
          <Field label={t('weight')} hint={t('weightHint')} error={fieldError('weight')}>
            <input
              name="weight"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={typed(goal?.weight)}
              className={inputClass}
            />
          </Field>
        )}
        <Field
          label={t('startsOn')}
          hint={fromRecords ? t('startsOnRecords') : t('datesHint')}
          error={fieldError('startsOn')}
        >
          <input
            name="startsOn"
            type="date"
            defaultValue={goal?.startsOn ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('dueOn')} error={fieldError('dueOn')}>
          <input name="dueOn" type="date" defaultValue={goal?.dueOn ?? ''} className={inputClass} />
        </Field>
      </div>

      <Field label={t('parent')} hint={t('parentHint')} error={fieldError('parentGoalId')}>
        <select
          name="parentGoalId"
          defaultValue={goal ? (goal.parent?.id ?? '') : (defaults.parentGoalId ?? '')}
          className={inputClass}
        >
          <option value="">{t('noParent')}</option>
          {parentChoices.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      </Field>

      {goal?.status === 'agreed' && goal.employee && (
        <p className="text-xs text-slate-500">{t('backToDraft')}</p>
      )}
      <SubmitButton>{goal ? t('save') : t('create')}</SubmitButton>
    </Form>
  );
}

/**
 * A check-in: tick the key results done, give the progress or the value, and a note. A KPI
 * from the records takes a note only; its value comes from the records.
 */
export function GoalCheckinForm({ goal }: { goal: GoalDetail }) {
  const t = useTranslations('goals.checkin');
  const withKeyResults = goal.kind === 'objective' && goal.keyResults.length > 0;
  const fromRecords = goal.kind === 'kpi' && isRecordSource(goal.source);
  const [state, action] = useActionState<ActionState<GoalDetail>, FormData>(
    checkinGoal.bind(null, goal.id, withKeyResults),
    undefined,
  );
  const fieldError = useFieldError(state);
  return (
    <Form state={state} action={action} className="space-y-4" key={goal.checkins.length}>
      {!state?.issues?.length && <Refused state={state} />}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      {withKeyResults && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">{t('keyResultsDone')}</legend>
          {goal.keyResults.map((k, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="done" value={i} defaultChecked={k.done} />
              {k.text}
            </label>
          ))}
        </fieldset>
      )}
      {goal.kind === 'objective' && !withKeyResults && (
        <Field label={t('progress')} hint={t('progressHint')} error={fieldError('progress')}>
          <input
            name="progress"
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={goal.progress}
            className={inputClass}
          />
        </Field>
      )}
      {goal.kind === 'kpi' && !fromRecords && (
        <Field label={t('value', { unit: goal.measureUnit ?? '' })} error={fieldError('value')}>
          <input name="value" type="number" min={0} step="0.01" className={inputClass} />
        </Field>
      )}
      {fromRecords && <p className="text-sm text-slate-600">{t('fromRecords')}</p>}
      <Field label={t('note')} error={fieldError('note')}>
        <textarea
          name="note"
          rows={2}
          maxLength={2000}
          required={fromRecords}
          className={inputClass}
        />
      </Field>
      <SubmitButton>{t('add')}</SubmitButton>
    </Form>
  );
}

/** Agree a draft, or mark an agreed goal completed. */
export function GoalStepButton({
  goalId,
  step,
  label,
  confirmText,
  variant = 'primary',
}: {
  goalId: string;
  step: 'agree' | 'complete';
  label: string;
  confirmText?: string;
  variant?: 'primary' | 'secondary';
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    moveGoal.bind(null, goalId, step),
    undefined,
  );
  return (
    <Form
      state={state}
      action={action}
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
      className="space-y-2"
    >
      <Refused state={state} />
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </Form>
  );
}

/** Dropping a goal says why; the note is kept with its check-ins. */
export function GoalDropForm({ goalId }: { goalId: string }) {
  const t = useTranslations('goals.drop');
  const [state, action] = useActionState<ActionState<GoalDetail>, FormData>(
    dropGoal.bind(null, goalId),
    undefined,
  );
  const fieldError = useFieldError(state);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">{t('open')}</summary>
      <Form
        state={state}
        action={action}
        onSubmit={(event) => {
          if (!window.confirm(t('confirm'))) event.preventDefault();
        }}
        className="mt-3 space-y-3"
      >
        {!state?.issues?.length && <Refused state={state} />}
        <Field label={t('note')} hint={t('noteHint')} error={fieldError('note')}>
          <textarea
            name="note"
            rows={2}
            required
            minLength={3}
            maxLength={2000}
            className={inputClass}
          />
        </Field>
        <SubmitButton variant="secondary">{t('submit')}</SubmitButton>
      </Form>
    </details>
  );
}

/** A button for a call that takes no form: its refusal or outcome shown beside it. */
function CallButton({
  label,
  call,
  done,
  variant = 'primary',
  confirmText,
}: {
  label: string;
  call: () => Promise<ActionState<unknown>>;
  done?: (state: ActionState<unknown>) => string | null;
  variant?: 'primary' | 'secondary';
  confirmText?: string;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState<unknown>>(undefined);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          start(async () => setState(await call()));
        }}
        className={buttonClass[variant]}
      >
        {pending ? '…' : label}
      </button>
      <Refused state={state} />
      {state?.ok && done?.(state) && <Banner tone="green">{done(state)}</Banner>}
    </div>
  );
}

/** Sends the login's drafts for a cycle to their manager. */
export function SubmitGoalsButton({ cycleId }: { cycleId: string | null }) {
  const t = useTranslations('goals');
  return (
    <CallButton
      label={t('submit')}
      variant="secondary"
      call={() => submitGoals(cycleId)}
      done={(state) => {
        const sent = (state as ActionState<{ goals: number; notified: number }>)?.result;
        if (!sent) return null;
        return sent.notified > 0 ? t('submitted', { count: sent.goals }) : t('submittedAlready');
      }}
    />
  );
}

/** Agrees every draft of one person for a cycle, showing the weight it comes to. */
export function AgreeAllGoalsButton({
  employeeId,
  cycleId,
  label,
}: {
  employeeId: string;
  cycleId: string | null;
  label: string;
}) {
  return <CallButton label={label} call={() => agreeAllGoals(employeeId, cycleId)} />;
}
