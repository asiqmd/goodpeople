'use client';

import {
  PROJECT_COST_KINDS,
  type AllocationView,
  type DonorView,
  type ProjectView,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import {
  addAllocation,
  closeProject,
  createDonor,
  createProject,
  deleteAllocation,
  endAllocation,
  setDonorActive,
  updateProject,
} from '@/app/actions/projects';
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

export function DonorForm() {
  const t = useTranslations('projects.donors');
  const [state, action] = useActionState<ActionState<DonorView>, FormData>(createDonor, undefined);
  return (
    <Form
      key={state?.ok ? state.result?.id : 'new'}
      state={state}
      action={action}
      className="space-y-3"
    >
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('added')}</Banner>}
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_6rem]">
        <Field label={t('code')} error={issueFor(state, 'code')}>
          <input name="code" required maxLength={30} className={`${inputClass} uppercase`} />
        </Field>
        <Field label={t('name')} error={issueFor(state, 'name')}>
          <input name="name" required maxLength={160} className={inputClass} />
        </Field>
        <Field label={t('country')} hint={t('countryHint')} error={issueFor(state, 'country')}>
          <input name="country" maxLength={2} className={`${inputClass} uppercase`} />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('add')}</SubmitButton>
    </Form>
  );
}

export function DonorActiveToggle({ donor }: { donor: DonorView }) {
  const t = useTranslations('projects.donors');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm font-medium text-slate-600 hover:underline"
      onClick={() =>
        start(async () => {
          await setDonorActive(donor.id, !donor.isActive);
        })
      }
    >
      {donor.isActive ? t('deactivate') : t('activate')}
    </button>
  );
}

/** A stored amount as typed: 2000000.00 → 2000000. */
const amount = (v: string | null | undefined) => (v ? String(Number(v)) : '');

/** A new project, or a project's details: company, donor, FD-6 approval, period and budgets. */
export function ProjectForm({
  project,
  entities,
  donors,
}: {
  project?: ProjectView;
  entities: { id: string; name: string }[];
  donors: DonorView[];
}) {
  const t = useTranslations('projects.form');
  const [state, action] = useActionState<ActionState<ProjectView>, FormData>(
    project ? updateProject.bind(null, project.id) : createProject,
    undefined,
  );
  const choosable = donors.filter((d) => d.isActive || d.id === project?.donor?.id);
  return (
    <Form state={state} action={action} className="space-y-4">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('code')} error={issueFor(state, 'code')}>
          <input
            name="code"
            required
            maxLength={30}
            defaultValue={project?.code}
            className={`${inputClass} font-mono uppercase`}
          />
        </Field>
        <Field label={t('name')} error={issueFor(state, 'name')}>
          <input name="name" required defaultValue={project?.name} className={inputClass} />
        </Field>
        <Field label={t('nameBn')} error={issueFor(state, 'nameBn')}>
          <input name="nameBn" defaultValue={project?.nameBn ?? ''} className={inputClass} />
        </Field>
        <Field label={t('legalEntity')} error={issueFor(state, 'legalEntityId')}>
          <select
            name="legalEntityId"
            required
            defaultValue={project?.legalEntity.id ?? entities[0]?.id}
            className={inputClass}
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('donor')} error={issueFor(state, 'donorId')}>
          <select name="donorId" defaultValue={project?.donor?.id ?? ''} className={inputClass}>
            <option value="">{t('noDonor')}</option>
            {choosable.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} · {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('grantReference')} error={issueFor(state, 'grantReference')}>
          <input
            name="grantReference"
            defaultValue={project?.grantReference ?? ''}
            className={inputClass}
          />
        </Field>
        <Field
          label={t('fd6ApprovalNo')}
          hint={t('fd6Hint')}
          error={issueFor(state, 'fd6ApprovalNo')}
        >
          <input
            name="fd6ApprovalNo"
            defaultValue={project?.fd6ApprovalNo ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('fd6ApprovedOn')} error={issueFor(state, 'fd6ApprovedOn')}>
          <input
            type="date"
            name="fd6ApprovedOn"
            defaultValue={project?.fd6ApprovedOn ?? ''}
            className={inputClass}
          />
        </Field>
        <div />
        <Field label={t('startsOn')} error={issueFor(state, 'startsOn')}>
          <input
            type="date"
            name="startsOn"
            required
            defaultValue={project?.startsOn}
            className={inputClass}
          />
        </Field>
        <Field label={t('endsOn')} hint={t('endsOnHint')} error={issueFor(state, 'endsOn')}>
          <input
            type="date"
            name="endsOn"
            defaultValue={project?.endsOn ?? ''}
            className={inputClass}
          />
        </Field>
        <div />
        <Field
          label={t('approvedBudget')}
          hint={t('approvedBudgetHint')}
          error={issueFor(state, 'approvedBudget')}
        >
          <input
            name="approvedBudget"
            inputMode="decimal"
            defaultValue={amount(project?.approvedBudget)}
            className={inputClass}
          />
        </Field>
        <Field
          label={t('staffBudget')}
          hint={t('staffBudgetHint')}
          error={issueFor(state, 'staffBudget')}
        >
          <input
            name="staffBudget"
            inputMode="decimal"
            defaultValue={amount(project?.staffBudget)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label={t('note')} error={issueFor(state, 'note')}>
        <textarea
          name="note"
          rows={2}
          maxLength={1000}
          defaultValue={project?.note ?? ''}
          className={inputClass}
        />
      </Field>
      <SubmitButton>{project ? t('save') : t('add')}</SubmitButton>
    </Form>
  );
}

export function CloseProjectButton({ project }: { project: ProjectView }) {
  const t = useTranslations('projects.close');
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(undefined);
  return (
    <span className="inline-flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={pending}
        className={buttonClass.secondary}
        onClick={() => {
          if (window.confirm(t('confirm', { code: project.code })))
            start(async () => setState(await closeProject(project.id)));
        }}
      >
        {t('button')}
      </button>
      <Refused state={state} />
    </span>
  );
}

/** A share of a person's salary charged to the project from a date. */
export function AllocationForm({
  projectId,
  people,
  startsOn,
  endsOn,
}: {
  projectId: string;
  people: { id: string; label: string }[];
  startsOn: string;
  endsOn: string | null;
}) {
  const t = useTranslations('projects.allocations');
  const [state, action] = useActionState<ActionState<AllocationView>, FormData>(
    addAllocation.bind(null, projectId),
    undefined,
  );
  return (
    <Form
      key={state?.ok ? state.result?.id : 'new'}
      state={state}
      action={action}
      className="space-y-3"
    >
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('added')}</Banner>}
      <div className="grid gap-3 sm:grid-cols-5">
        <div className="sm:col-span-2">
          <Field label={t('person')} error={issueFor(state, 'employeeId')}>
            <select name="employeeId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                {t('choose')}
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('percent')} error={issueFor(state, 'percent')}>
          <input
            name="percent"
            inputMode="decimal"
            required
            placeholder="50"
            className={inputClass}
          />
        </Field>
        <Field label={t('kind')} error={issueFor(state, 'costKind')}>
          <select name="costKind" defaultValue="programme" className={inputClass}>
            {PROJECT_COST_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <div />
        <Field label={t('from')} error={issueFor(state, 'fromOn')}>
          <input
            type="date"
            name="fromOn"
            required
            min={startsOn}
            max={endsOn ?? undefined}
            className={inputClass}
          />
        </Field>
        <Field label={t('to')} hint={t('toHint')} error={issueFor(state, 'toOn')}>
          <input
            type="date"
            name="toOn"
            min={startsOn}
            max={endsOn ?? undefined}
            className={inputClass}
          />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('add')}</SubmitButton>
    </Form>
  );
}

/** Ends a share on a day, or removes one that has not started. */
export function AllocationActions({
  allocation,
  started,
}: {
  allocation: AllocationView;
  started: boolean;
}) {
  const t = useTranslations('projects.allocations');
  const [state, action] = useActionState<ActionState<AllocationView>, FormData>(
    endAllocation.bind(null, allocation.id),
    undefined,
  );
  const [pending, start] = useTransition();
  const [removed, setRemoved] = useState<ActionState>(undefined);
  if (!started) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={pending}
          className="text-sm font-medium text-red-700 hover:underline"
          onClick={() => {
            if (window.confirm(t('deleteConfirm', { name: allocation.employee.fullName })))
              start(async () => setRemoved(await deleteAllocation(allocation.id)));
          }}
        >
          {t('delete')}
        </button>
        <Refused state={removed} />
      </span>
    );
  }
  return (
    <Form state={state} action={action} className="flex flex-wrap items-center justify-end gap-2">
      <label className="sr-only" htmlFor={`end-${allocation.id}`}>
        {t('endOn')}
      </label>
      <input
        id={`end-${allocation.id}`}
        type="date"
        name="toOn"
        required
        min={allocation.fromOn}
        max={allocation.toOn ?? undefined}
        defaultValue={allocation.toOn ?? ''}
        className={`${inputClass} w-40 py-1 text-xs`}
      />
      <SubmitButton variant="secondary">{t('end')}</SubmitButton>
      {state?.error && (
        <span className="w-full text-end text-xs text-red-600">
          {issueFor(state, 'toOn') ?? <ErrorText state={state} />}
        </span>
      )}
    </Form>
  );
}
