'use client';

import type { Competency, CycleDetail, CycleLaunchResult, Ref } from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import type { ActionState } from '@/app/actions/platform';
import {
  addCyclePerson,
  calibrateCycle,
  createCycle,
  launchCycle,
  moveCycle,
  saveCycleDates,
  updateCycle,
} from '@/app/actions/reviews';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';
import { Refused } from './review-forms';

/** Competencies as rows of key, English and Bangla, with a row to add another. */
export function CompetencyRows({
  initial,
  state,
}: {
  initial: Competency[];
  state: ActionState<unknown>;
}) {
  const t = useTranslations('reviews.competencies');
  const [rows, setRows] = useState(() => initial.map((c, i) => ({ ...c, id: i })));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-800">{t('title')}</legend>
      <p className="text-xs text-slate-500">{t('hint')}</p>
      {issueFor(state, 'competencies') && (
        <p className="text-xs text-red-600">{issueFor(state, 'competencies')}</p>
      )}
      {rows.map((row, i) => (
        <div key={row.id} className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr_auto]">
          <input
            name={`competencies.${i}.key`}
            defaultValue={row.key}
            required
            aria-label={t('key')}
            placeholder={t('key')}
            className={inputClass}
          />
          <input
            name={`competencies.${i}.en`}
            defaultValue={row.en}
            required
            aria-label={t('en')}
            placeholder={t('en')}
            className={inputClass}
          />
          <input
            name={`competencies.${i}.bn`}
            defaultValue={row.bn}
            required
            lang="bn"
            aria-label={t('bn')}
            placeholder={t('bn')}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
            disabled={rows.length === 1}
            className={buttonClass.ghost}
          >
            {t('remove')}
          </button>
          {[
            issueFor(state, `competencies.${i}.key`),
            issueFor(state, `competencies.${i}.en`),
            issueFor(state, `competencies.${i}.bn`),
          ]
            .filter(Boolean)
            .map((message) => (
              <p key={message} className="text-xs text-red-600 sm:col-span-4">
                {message}
              </p>
            ))}
        </div>
      ))}
      {rows.length < 12 && (
        <button
          type="button"
          onClick={() =>
            setRows([
              ...rows,
              { key: '', en: '', bn: '', id: Math.max(0, ...rows.map((r) => r.id)) + 1 },
            ])
          }
          className={buttonClass.secondary}
        >
          {t('add')}
        </button>
      )}
    </fieldset>
  );
}

const STEPS = ['goalsDueOn', 'selfDueOn', 'peerDueOn', 'managerDueOn', 'calibrationDueOn'] as const;

function StepDates({
  cycle,
  state,
}: {
  cycle?: Pick<CycleDetail, (typeof STEPS)[number]>;
  state: ActionState<unknown>;
}) {
  const t = useTranslations('reviews.cycle.steps');
  return (
    <div className="grid gap-4 sm:grid-cols-5">
      {STEPS.map((step) => (
        <Field key={step} label={t(step)} error={issueFor(state, step)}>
          <input
            type="date"
            name={step}
            defaultValue={cycle?.[step] ?? ''}
            className={inputClass}
          />
        </Field>
      ))}
    </div>
  );
}

/** A new cycle, or a draft's whole set-up. */
export function CycleForm({
  cycle,
  entities,
  competencies,
}: {
  cycle?: CycleDetail;
  entities: Ref[];
  competencies: Competency[];
}) {
  const t = useTranslations('reviews.cycle.form');
  const [state, action] = useActionState<ActionState<CycleDetail>, FormData>(
    cycle ? updateCycle.bind(null, cycle.id) : createCycle,
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-5">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('name')} hint={t('nameHint')} error={issueFor(state, 'name')}>
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={cycle?.name}
            className={inputClass}
          />
        </Field>
        <Field label={t('periodStart')} error={issueFor(state, 'periodStart')}>
          <input
            type="date"
            name="periodStart"
            required
            defaultValue={cycle?.periodStart}
            className={inputClass}
          />
        </Field>
        <Field label={t('periodEnd')} error={issueFor(state, 'periodEnd')}>
          <input
            type="date"
            name="periodEnd"
            required
            defaultValue={cycle?.periodEnd}
            className={inputClass}
          />
        </Field>
      </div>
      {entities.length > 1 && (
        <fieldset className="space-y-1 text-sm">
          <legend className="font-medium text-slate-800">{t('companies')}</legend>
          <p className="text-xs text-slate-500">{t('companiesHint')}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {entities.map((e) => (
              <label key={e.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="legalEntityIds"
                  value={e.id}
                  defaultChecked={cycle?.legalEntityIds.includes(e.id)}
                />
                {e.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={t('joinedOnOrBefore')}
          hint={t('joinedOnOrBeforeHint')}
          error={issueFor(state, 'joinedOnOrBefore')}
        >
          <input
            type="date"
            name="joinedOnOrBefore"
            defaultValue={cycle?.joinedOnOrBefore ?? ''}
            className={inputClass}
          />
        </Field>
        <label className="flex items-start gap-2 pt-6 text-sm">
          <input type="checkbox" name="selfReview" defaultChecked={cycle?.selfReview ?? true} />
          <span>
            {t('selfReview')}
            <span className="block text-xs text-slate-500">{t('selfReviewHint')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 pt-6 text-sm">
          <input type="checkbox" name="peerReview" defaultChecked={cycle?.peerReview ?? false} />
          <span>
            {t('peerReview')}
            <span className="block text-xs text-slate-500">{t('peerReviewHint')}</span>
          </span>
        </label>
      </div>
      <StepDates cycle={cycle} state={state} />
      <CompetencyRows initial={cycle?.competencies ?? competencies} state={state} />
      <SubmitButton>{cycle ? t('save') : t('create')}</SubmitButton>
    </Form>
  );
}

/** A launched cycle's name and step dates. */
export function CycleDatesForm({ cycle }: { cycle: CycleDetail }) {
  const t = useTranslations('reviews.cycle.form');
  const [state, action] = useActionState<ActionState<CycleDetail>, FormData>(
    saveCycleDates.bind(null, cycle.id),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-4">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <Field label={t('name')} error={issueFor(state, 'name')}>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={cycle.name}
          className={inputClass}
        />
      </Field>
      <StepDates cycle={cycle} state={state} />
      <SubmitButton variant="secondary">{t('saveDates')}</SubmitButton>
    </Form>
  );
}

/** Launching a draft, or adding to an active cycle those who have come into it since. */
export function LaunchButton({ cycle }: { cycle: CycleDetail }) {
  const t = useTranslations('reviews.cycle.actions');
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState<CycleLaunchResult>>(undefined);
  const draft = cycle.status === 'draft';
  return (
    <div className="space-y-2">
      {state?.error && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      {state?.ok && state.result && (
        <Banner tone="green">{t('launched', { count: state.result.created })}</Banner>
      )}
      <p className="text-sm text-slate-600">{draft ? t('launchHint') : t('addNewHint')}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (draft && !window.confirm(t('launchConfirm'))) return;
          start(async () => setState(await launchCycle(cycle.id)));
        }}
        className={draft ? buttonClass.primary : buttonClass.secondary}
      >
        {pending ? '…' : draft ? t('launch') : t('addNew')}
      </button>
    </div>
  );
}

/** Adds one person to an active cycle by their employee code. */
export function AddPersonForm({ cycleId }: { cycleId: string }) {
  const t = useTranslations('reviews.cycle.actions');
  const [state, action] = useActionState<ActionState<CycleLaunchResult>, FormData>(
    addCyclePerson.bind(null, cycleId),
    undefined,
  );
  return (
    <Form
      key={state?.ok ? 'added' : 'add'}
      state={state}
      action={action}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="min-w-48 flex-1">
        <Field
          label={t('addPerson')}
          hint={t('addPersonHint')}
          error={issueFor(state, 'employeeCode')}
        >
          <input name="employeeCode" required maxLength={40} className={inputClass} />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('add')}</SubmitButton>
      <div className="w-full">
        {state?.error && !state.issues?.length && <Refused state={state} />}
        {state?.ok && <Banner tone="green">{t('added')}</Banner>}
      </div>
    </Form>
  );
}

/** Moving the cycle to calibration; a note says why when manager reviews are still missing. */
export function CalibrateForm({ cycle }: { cycle: CycleDetail }) {
  const t = useTranslations('reviews.cycle.actions');
  const format = useFormatter();
  const [state, action] = useActionState<ActionState<CycleDetail>, FormData>(
    calibrateCycle.bind(null, cycle.id),
    undefined,
  );
  const missing = cycle.progress.byStatus.self + cycle.progress.byStatus.manager;
  return (
    <Form state={state} action={action} className="space-y-3">
      <Refused state={state} />
      <p className="text-sm text-slate-600">
        {missing
          ? t('calibrateMissing', { count: missing, n: format.number(missing) })
          : t('calibrateReady')}
      </p>
      {missing > 0 && (
        <Field label={t('note')} hint={t('noteHint')}>
          <textarea name="note" required rows={2} maxLength={1000} className={inputClass} />
        </Field>
      )}
      <SubmitButton>{t('calibrate')}</SubmitButton>
    </Form>
  );
}

/** Releasing every review once each has its final rating, or closing a released cycle. */
export function CycleMoveButton({ cycleId, move }: { cycleId: string; move: 'release' | 'close' }) {
  const t = useTranslations('reviews.cycle.actions');
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState<CycleDetail>>(undefined);
  return (
    <div className="space-y-2">
      {state?.error && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t(`${move}Confirm`))) return;
          start(async () => setState(await moveCycle(cycleId, move)));
        }}
        className={move === 'release' ? buttonClass.primary : buttonClass.secondary}
      >
        {pending ? '…' : t(move)}
      </button>
    </div>
  );
}
